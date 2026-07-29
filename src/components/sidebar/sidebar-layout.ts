const TOOL_SUBNAV_ROW_HEIGHT = 30
const TOOL_SUBNAV_GAP = 2
const TOOL_SUBNAV_MARGIN_TOP = 3
const TOOL_SUBNAV_MARGIN_BOTTOM = 2

export function calculateToolSubnavFlowOffset(childCount: number): number {
  if (childCount <= 0) return 0

  return (
    childCount * TOOL_SUBNAV_ROW_HEIGHT
    + (childCount - 1) * TOOL_SUBNAV_GAP
    + TOOL_SUBNAV_MARGIN_TOP
    + TOOL_SUBNAV_MARGIN_BOTTOM
  )
}

export function createSidebarLayout(childCount: number) {
  const flowOffset = calculateToolSubnavFlowOffset(childCount)

  return {
    flowOffset,
    style: {
      '--tool-subnav-row-height': `${TOOL_SUBNAV_ROW_HEIGHT}px`,
      '--tool-subnav-gap': `${TOOL_SUBNAV_GAP}px`,
      '--tool-subnav-margin-top': `${TOOL_SUBNAV_MARGIN_TOP}px`,
      '--tool-subnav-margin-bottom': `${TOOL_SUBNAV_MARGIN_BOTTOM}px`,
      '--tool-subnav-flow-offset': `${flowOffset}px`,
    },
  }
}
