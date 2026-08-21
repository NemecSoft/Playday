// iOS 风 Switch（基于 @radix-ui/react-switch）。
// 样式全部用纯 CSS（global.css 的 .switch / .switch-thumb），
// 不依赖 Tailwind JIT 扫描 data-[state=...] 选择器（JIT 经常漏生成，
// 之前 bg-zinc-500/40 在 dist CSS 里压根不存在，Switch 关闭态就一片空）。
import * as React from "react";
import * as SwitchPrimitives from "@radix-ui/react-switch";
import { cn } from "../../lib/utils";

function Switch({
  className,
  ...props
}: React.ComponentProps<typeof SwitchPrimitives.Root>) {
  return (
    <SwitchPrimitives.Root className={cn("switch", className)} {...props}>
      <SwitchPrimitives.Thumb className="switch-thumb" />
    </SwitchPrimitives.Root>
  );
}

export { Switch };
