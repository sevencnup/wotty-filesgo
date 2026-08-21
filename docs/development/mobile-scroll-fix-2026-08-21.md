# 移动端无法上下滑动修复

## 目标

修复移动端页面内容超出视口后无法上下滑动的问题，同时保留页面切换动画。

## 现状问题

页面滚动被多层 overflow 与固定高度锁死，移动端单列堆叠内容被裁切无法滚动：

1. layout.tsx：body 使用 h-screen overflow-hidden，锁定高度并禁止滚动。
2. page-transition.tsx：容器 h-full overflow-hidden，内容层锁死为视口高度并裁掉溢出。
3. 容器还带 contain: layout paint，进一步裁掉溢出内容。

## 方案

1. body 改为 min-h-screen，移除固定高度与 overflow-hidden，允许正常滚动。
2. 容器改为 min-h-screen overflow-x-hidden，删除 h-full overflow-hidden 与 contain: layout paint。
3. 内容层改为 position relative + min-height 100vh，内容参与文档流、高度随内容增长；横向滑动动画保留，由容器 overflow-x-hidden 裁掉横向溢出。

## 实施

- 修改 frontend/src/app/layout.tsx 的 body className。
- 修改 frontend/src/components/page-transition.tsx 的容器与内容层样式。

## 验收标准

- 移动端（宽度小于 620px）页面上下可正常滚动，页脚可见。
- 桌面端布局、页面切换横向滑动动画不受影响。
- 无横向滚动条。
