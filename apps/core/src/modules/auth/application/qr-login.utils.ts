const RE_UIN_PREFIX = /^o0*/

export class CookieUtils {
  static parse(cookieStr: string): Record<string, string> {
    if (!cookieStr)
      return {}
    return cookieStr.split(';').reduce((acc: Record<string, string>, curr) => {
      const [key, value] = curr.split('=')
      if (key)
        acc[key.trim()] = value ? value.trim() : ''
      return acc
    }, {})
  }

  static getValue(cookies: string | string[] | null, key: string): string | null {
    if (!cookies)
      return null
    const str = Array.isArray(cookies) ? cookies.join('; ') : cookies
    const match = str.match(new RegExp(`(^|;\\s*)${key}=([^;]*)`))
    return match ? match[2] : null
  }

  static getUin(cookies: string | string[]): string | null {
    const uin = this.getValue(cookies, 'wxuin') || this.getValue(cookies, 'uin') || this.getValue(cookies, 'ptui_loginuin')
    if (!uin)
      return null
    return uin.replace(RE_UIN_PREFIX, '')
  }
}

export class HashUtils {
  static hash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++)
      hash += (hash << 5) + str.charCodeAt(i)
    return 2147483647 & hash
  }

  static getGTk(pskey: string): number {
    let gtk = 5381
    for (let i = 0; i < pskey.length; i++)
      gtk += (gtk << 5) + pskey.charCodeAt(i)
    return gtk & 0x7FFFFFFF
  }
}
