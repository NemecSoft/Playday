// 管理端搜索：统一复用 shared/search.ts 的实现，避免复制两份。
// 只做 re-export，管理端其它地方照旧 import "./search"。

export {
  pinyinInitials,
  gameNameVariants,
  displayName,
  matchSearch,
} from "../../shared/search";
