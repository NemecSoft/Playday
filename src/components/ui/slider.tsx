// shadcn/ui Slider（基于 @radix-ui/react-slider）。
// 替代手写的 <input type="range">，提供统一的滑杆样式（轨道 + 填充 + 圆点）。
// 注意：shadcn 默认用 --primary 作为填充色；这里沿用项目 token。
import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { cn } from "../../lib/utils";

function Slider({
  className,
  ...props
}: React.ComponentProps<typeof SliderPrimitive.Root>) {
  return (
    <SliderPrimitive.Root
      className={cn(
        "relative flex w-full touch-none select-none items-center",
        className,
      )}
      {...props}
    >
      <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-border shadow-inner">
        <SliderPrimitive.Range className="absolute h-full rounded-full bg-primary" />
      </SliderPrimitive.Track>
      <SliderPrimitive.Thumb className="block h-5 w-5 rounded-full border-2 border-primary-foreground bg-primary shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_2px_6px_rgba(0,0,0,0.4)] transition-[transform,box-shadow] hover:scale-110 hover:shadow-[0_0_0_1px_rgba(0,0,0,0.2),0_0_12px_rgba(59,130,246,0.9)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:pointer-events-none disabled:opacity-50" />
    </SliderPrimitive.Root>
  );
}

export { Slider };
