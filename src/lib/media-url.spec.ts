import { describe, expect, it } from 'vitest'
import { toMediaUrl } from './media-url'

describe('toMediaUrl', () => {
  it('turns Windows paths into media:// urls that survive spaces and CJK', () => {
    expect(toMediaUrl('D:\\baka\\图库\\my pic.png')).toBe('media:///D:/baka/%E5%9B%BE%E5%BA%93/my%20pic.png')
    expect(toMediaUrl('D:/already/forward.jpg')).toBe('media:///D:/already/forward.jpg')
  })
})
