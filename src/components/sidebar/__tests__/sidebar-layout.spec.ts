import { describe, expect, it } from 'vitest'
import { calculateToolSubnavFlowOffset, createSidebarLayout } from '../sidebar-layout'

describe('sidebar layout geometry', () => {
  it('calculates submenu flow height from its child count', () => {
    expect(calculateToolSubnavFlowOffset(0)).toBe(0)
    expect(calculateToolSubnavFlowOffset(1)).toBe(35)
    expect(calculateToolSubnavFlowOffset(2)).toBe(67)
    expect(calculateToolSubnavFlowOffset(4)).toBe(131)
  })

  it('returns the flow offset and every CSS geometry variable together', () => {
    expect(createSidebarLayout(4)).toEqual({
      flowOffset: 131,
      style: {
        '--tool-subnav-row-height': '30px',
        '--tool-subnav-gap': '2px',
        '--tool-subnav-margin-top': '3px',
        '--tool-subnav-margin-bottom': '2px',
        '--tool-subnav-flow-offset': '131px',
      },
    })
    expect(createSidebarLayout(0).flowOffset).toBe(0)
  })
})
