// 房間的計數邏輯。刻意不碰 Cloudflare 的任何 API,才能被 scripts/smoke.mjs 直接 import 斷言。
// DeckRoom 只負責收發 WebSocket,算數全在這裡。

export const MAX_COMMENTS = 100
export const MAX_TEXT = 200
export const MAX_NAME = 12

export const PACE_KEYS = ['faster', 'slower', 'lost']
export const REACT_KEYS = ['like', 'agree']

export function createRoom() {
  return {
    page: null,
    pace: new Map(),          // 連線編號 -> 'faster' | 'slower' | 'lost'
    reactions: { like: 0, agree: 0 },
    burst: { like: 0, agree: 0 },   // 這個廣播週期內新增的次數,送出後歸零
    comments: [],             // 最舊的在前面
    seq: 0
  }
}

const clip = (v, n) => String(v == null ? '' : v).slice(0, n).trim()

// 套用一則訊息。回傳 true 表示狀態變了、該排一次廣播。
export function applyMessage(room, connId, msg, role) {
  if (!msg || typeof msg !== 'object') return false

  switch (msg.type) {
    // 講者翻頁。只有翻到「不同的一頁」才清空節奏票,重送同一頁的 state 不會誤清。
    case 'state': {
      if (typeof msg.page !== 'number') return false
      if (msg.page === room.page) return false
      room.page = msg.page
      room.pace.clear()
      return true
    }

    // 快一點 / 慢一點 / 聽不懂:每條連線每頁一票,同一顆再按等於取消,按另一顆等於改票。
    case 'pace': {
      if (!PACE_KEYS.includes(msg.v)) return false
      if (room.pace.get(connId) === msg.v) room.pace.delete(connId)
      else room.pace.set(connId, msg.v)
      return true
    }

    // 喜歡 / 同意:整場累計,不受翻頁影響。burst 讓所有人的畫面同步飄一次。
    case 'react': {
      if (!REACT_KEYS.includes(msg.v)) return false
      room.reactions[msg.v] += 1
      room.burst[msg.v] += 1
      return true
    }

    case 'comment': {
      const text = clip(msg.text, MAX_TEXT)
      if (!text) return false
      room.comments.push({
        id: ++room.seq,
        name: clip(msg.name, MAX_NAME) || '路人',
        text,
        q: !!msg.q,
        likedBy: new Set(),
        answered: false,
        at: typeof msg.at === 'number' ? msg.at : Date.now()
      })
      // 滿了砍最舊的
      while (room.comments.length > MAX_COMMENTS) room.comments.shift()
      return true
    }

    // 對某則留言按讚。每條連線每則只算一次,再按取消。
    case 'like': {
      const c = room.comments.find(x => x.id === msg.id)
      if (!c) return false
      if (c.likedBy.has(connId)) c.likedBy.delete(connId)
      else c.likedBy.add(connId)
      return true
    }

    // 標記已回答。只有講者能做。
    case 'answered': {
      if (role !== 'host' && role !== 'remote') return false
      const c = room.comments.find(x => x.id === msg.id)
      if (!c || c.answered) return false
      c.answered = true
      return true
    }

    default:
      return false
  }
}

// 已回答的沉到最底;其餘讚多的在上面,同讚數比誰新。
export function sortComments(comments) {
  return comments.slice().sort((a, b) => {
    if (a.answered !== b.answered) return a.answered ? 1 : -1
    const d = b.likedBy.size - a.likedBy.size
    if (d) return d
    return b.at - a.at
  })
}

export function snapshot(room, viewers) {
  const pace = { faster: 0, slower: 0, lost: 0 }
  for (const v of room.pace.values()) pace[v] += 1
  return {
    type: 'tally',
    page: room.page,
    viewers,
    pace,
    reactions: { ...room.reactions },
    burst: { ...room.burst },
    comments: sortComments(room.comments).map(c => ({
      id: c.id, name: c.name, text: c.text, q: c.q,
      likes: c.likedBy.size, answered: c.answered, at: c.at
    }))
  }
}

// 廣播完才歸零,不然沒送出去的那一波動畫會不見。
export function clearBurst(room) {
  room.burst.like = 0
  room.burst.agree = 0
}

const ADJ = ['編織', '打盹', '迷路', '碎念', '發光', '慢慢', '偷偷', '暖呼呼', '圓滾滾', '毛茸茸',
  '安靜', '好奇', '認真', '悠哉', '蓬鬆', '眨眼', '嘴饞', '晃來晃去', '躡手躡腳', '曬太陽',
  '看星星', '寫程式', '愛下雨', '找路']
const ANIMAL = ['小熊', '水獺', '柴犬', '貓頭鷹', '海豹', '刺蝟', '企鵝', '樹懶', '狐狸', '兔子',
  '浣熊', '鯨魚', '山羌', '藍鵲', '石虎', '穿山甲', '海龜', '羊駝', '鴨嘴獸', '長頸鹿',
  '章魚', '螢火蟲', '土撥鼠', '柯基']

// 24 x 24 = 576 組。撞名不影響任何計數(去重全用連線編號),純顯示用。
export function cuteName(rand = Math.random) {
  return ADJ[Math.floor(rand() * ADJ.length)] + ANIMAL[Math.floor(rand() * ANIMAL.length)]
}
