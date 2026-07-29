# Dashboard Continuation and Interaction Design

## 1. Goal

Keep the approved character hero unchanged while making the area below it and the left navigation feel responsive, layered, and alive. At the same time, make the hero action continue the user's most relevant unfinished work instead of always favoring LoRA training.

The visual direction is:

- Dashboard panel: approved “A — layered workbench.”
- Sidebar: approved “A — sliding active rail.”
- Sidebar chrome: borderless.
- Motion: local, pointer-driven feedback instead of global particles, scanlines, or decorative loops.

## 2. Scope

This iteration changes:

- Dashboard continuation selection.
- Remembering the last meaningful workspace.
- Dashboard information hierarchy and interaction feedback.
- Sidebar borders, active-route indicator, hover, press, and submenu transitions.
- Reduced-motion and keyboard-focus equivalents.

This iteration does not change:

- Hero artwork, copy, crop, or animation.
- Gallery, annotation, reverse-prompt, or training business behavior.
- Training runtime installation, updater, packaging, or backend IPC.
- Live2D or animated character behavior.

## 3. Continue-work behavior

### 3.1 Meaningful workspace history

Persist the last meaningful workspace route locally after successful navigation.

Allowed remembered routes:

- `/gallery`
- `/tagger`
- `/training`
- `/training/runtime`
- `/reverse`
- `/upscale`
- `/generate`
- `/console`

Do not remember:

- Dashboard `/`
- Settings
- Unknown routes
- `/training/run` after the active task is gone

When `/training/run` is visited without a recoverable active task, normalize the remembered destination to `/training`.

### 3.2 Priority

The dashboard primary action resolves in this order:

1. A currently running pipeline task → continue that task at `/training/run`.
2. An unfinished annotation queue → continue annotation at `/tagger`.
3. A valid remembered workspace → return to that workspace with a route-specific label.
4. One or more prepared datasets → continue training preparation at `/training`.
5. Otherwise → import the first batch of material at `/gallery`.

Required labels:

| Destination | Action label |
|---|---|
| Running task | `继续 {任务名}` |
| Annotation queue | `继续标注 {数量} 张素材` |
| Gallery | `继续整理图库` |
| Annotation | `返回标注工作区` |
| Training | `继续配置训练` |
| Training environment | `继续配置训练环境` |
| Reverse prompt | `继续提示词反推` |
| Upscale | `继续超分放大` |
| Generate | `继续 AI 生成` |
| Console | `返回控制台` |
| Prepared dataset fallback | `继续准备训练` |
| Empty workspace | `导入第一批素材` |

Only whitelisted routes may be restored. Corrupt or obsolete saved values fall through to the next priority without producing an error.

## 4. Layered dashboard panel

### 4.1 Composition

Keep the existing 24px overlap with the hero, but reorganize the lower surface into three perceptible layers:

1. **Current-work layer**
   - Shows the resolved continuation label and its primary action.
   - This is the strongest information layer.

2. **Real-status strip and recent rows**
   - Uses only available data: gallery image count, dataset count, and unfinished annotation count.
   - Shows recent or useful workspace rows without inventing historical metrics.

3. **System monitor dock**
   - Keeps CPU, GPU, VRAM, temperature, and RAM.
   - Visually behaves as a compact dock attached to the right side.

At widths up to 1160px, the monitor dock stacks below the work layer. Scaling must never cause horizontal scrolling.

### 4.2 Dynamic stacking

Hover-capable devices receive local depth feedback:

| Region | Hover feedback |
|---|---|
| Main work layer | `translateY(-4px) scale(1.012)` |
| Monitor dock | `translateY(-4px) scale(1.018)` |
| Status segment | `translateY(-3px) scale(1.02)` |
| Work row | `translateX(4px) scale(1.006)` |
| Pressed row/action | brief scale down to `0.985` |

When one major layer is hovered:

- Raise its stacking order.
- Add a restrained directional shadow.
- Reduce adjacent layer opacity to `0.72`.
- Reduce adjacent saturation slightly.
- Do not reflow or resize the surrounding layout.

Major-layer transitions use 180ms ease-out timing. Status segments and work rows use 160ms ease-out timing. No dashboard panel uses random motion.

### 4.3 State feedback

- Updated task or device values produce one 260ms highlight pulse.
- Progress meters animate only from the previous value to the new value.
- The local-runtime dot uses one slow 3.6-second breathing loop.
- No other panel animation loops indefinitely.

## 5. Borderless sidebar

### 5.1 Surface

Remove:

- Sidebar outer border.
- Right vertical divider.
- Internal horizontal dividers.
- Border on the tools submenu.

Use background tone, spacing, the active rail, and soft submenu shadow to separate navigation from content.

### 5.2 Sliding active rail

- A 3px rounded rail marks the current route.
- It moves between navigation items in 240ms.
- Nested tool routes keep the rail on the Tools item.
- The rail position follows actual route state, including browser history navigation.

### 5.3 Item feedback

On hover:

- Item moves right 2px and scales to `1.018`.
- Icon moves up 1px, rotates at most 3 degrees, and scales to `1.07`.
- Label moves right 3px.
- A soft selected or hover surface appears without a border.

On press:

- Item briefly scales to `0.97`.

The tools submenu:

- Opens from the Tools item with a 180ms opacity and scale transition.
- Uses shadow and surface contrast, not a border.
- Closes when leaving tool routes unless the user explicitly opens it on the current page.

The sidebar does not automatically expand its full width on pointer hover.

## 6. Accessibility and motion safety

- Every pointer hover state has an equivalent `:focus-visible` treatment.
- Native buttons remain keyboard accessible.
- Focus outlines remain visible above shadows and transforms.
- Hover transforms apply only when the device supports hover.
- `prefers-reduced-motion: reduce` removes transforms, rail travel animation, pulse, and breathing effects while preserving state changes.
- Motion must not convey information without text, position, or an accessible state.

## 7. Data and component boundaries

Use small, testable units:

- A pure continuation resolver accepts active task, unfinished annotation count, dataset count, and remembered workspace.
- A small workspace-history helper validates, normalizes, loads, and saves routes.
- The router records meaningful workspace routes after navigation.
- Dashboard composes the resolver result and real store values.
- Sidebar owns only navigation presentation and local submenu state.
- CSS owns pointer and focus motion; business stores do not own animation state.

## 8. Verification

Automated verification:

- Continuation priority tests.
- Invalid and obsolete remembered-route tests.
- Route normalization tests.
- Sidebar active-rail and route-sync source contracts.
- Dashboard real-status and no-invented-metrics contracts.
- Reduced-motion and keyboard-focus contracts.
- Full tests, typecheck, IPC check, and renderer build.

Visual verification in Electron:

- 1440×900 and 1100×720.
- Light and dark themes.
- Pointer hover over each dashboard layer.
- Keyboard navigation through sidebar and dashboard rows.
- Tool route entry, manual submenu toggle, and route exit.
- Active training, unfinished annotation, remembered workspace, prepared dataset, and empty-workspace continuation states.
- No horizontal scrolling or content clipping during transforms.

## 9. Temporary preview cleanup

After the implementation is accepted:

- Remove `dashboard-motion-directions.html`.
- Remove `dashboard-panel-directions.html`.
- Remove `sidebar-motion-directions.html`.
- Remove any screenshots or rendered wrappers created only for comparison.

Only production code, automated tests, deterministic runtime assets, the approved specification, and the implementation plan remain.
