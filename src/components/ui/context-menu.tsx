// 右键菜单的**外壳**：定位 + 点外面关掉 + Esc 关掉 + 统一的菜单项样式。
//
// 为什么抽出来：仓库里没有 shadcn 的 context-menu（也没装 Radix 的 context-menu 包），
// 一直是手写（GameContextMenu 就是这么写的）。2026-09-15 顶栏标签也要右键菜单 ——
// 再复制一份的后果是"两处菜单的圆角/阴影/关闭时机各自漂"，而这类不一致没人会发现。
//
// ⚠️ 这里只管"长什么样、什么时候关"；点哪一项做什么由调用方决定（菜单项当 children 传进来）。
// ⚠️ 菜单项点完**要自己调 onClose**（见下面的说明，外壳故意不替它关）——
//    因为"点菜单内部"必须被排除在"点外面"之外，否则一按下鼠标菜单就没了、click 根本传不到按钮。

import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  /** 鼠标位置（视口坐标，调用方用 clientX / clientY）。 */
  x: number;
  y: number;
  onClose: () => void;
  /** 最小宽度。游戏菜单文案长，用默认 180px；标签菜单短一些可以给窄一点。 */
  minWidth?: number;
  children: ReactNode;
}

export function ContextMenu({ x, y, onClose, minWidth = 180, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 关掉的三种情形：点别处、Esc、右键别处（右键也会触发 pointerdown）。
    // 用 pointerdown 而不是 click：右键按下后紧接着右键另一处时 **不产生 click**，
    // 只监听 click 的话菜单会赖着不走（要再点一次左键才消失）。
    const onDown = (e: PointerEvent) => {
      // ⚠️ 点在菜单内部不能关 —— 否则"按下鼠标"就把它卸了，那一项收不到 click。
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      // `context-menu` 这个类名只为一件事：`-webkit-app-region: no-drag`（见 global.css）。
      // 顶栏整体是窗口拖拽区，而**拖拽区会连带它的所有后代** —— 标签的右键菜单正好渲染在
      // 顶栏里面，不排除的话点菜单项会变成拖窗口（菜单看着在、就是点不动）。
      className="context-menu fixed z-[1500] rounded-md border border-border-strong bg-panel p-[5px] shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
      style={{ left: x, top: y, minWidth }}
      // 在菜单上再点右键：不弹原生菜单，也不当"点外面"（pointerdown 已经被上面的 ref 排除）。
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>
  );
}

interface ItemProps {
  icon: ReactNode;
  label: string;
  /** ⚠️ 调用方要在里面**顺带调 onClose**（外壳不替它关，原因见文件头）。 */
  onClick: () => void;
  /** 破坏性操作（关闭 / 删除这类）用红色。 */
  danger?: boolean;
}

export function ContextMenuItem({ icon, label, onClick, danger = false }: ItemProps) {
  return (
    <button
      type="button"
      className={`flex w-full cursor-pointer items-center gap-2 rounded px-3 py-[7px] text-left text-[13px] text-primary-text hover:bg-item-hover ${
        danger ? "text-danger" : ""
      }`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}
