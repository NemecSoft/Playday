// 侧栏底部"谁在玩"：显示当前在线用户（头像色块 + 昵称 + 正在玩的游戏）。
// 数据来自社区氛围 store（默认模拟）。可在设置里关闭。
import { useCommunityStore } from "../../utils/community/store";

export default function WhoIsOnline() {
  const enabled = useCommunityStore((s) => s.enabled);
  const onlineUsers = useCommunityStore((s) => s.onlineUsers);

  if (!enabled || onlineUsers.length === 0) return null;

  return (
    <div className="who-online">
      <div className="who-online-title">
        <span className="who-online-dot" />
        在线 · {onlineUsers.length} 人
      </div>
      <div className="who-online-list">
        {onlineUsers.slice(0, 12).map((u) => (
          <div key={u.id} className="who-online-item">
            <span
              className="who-online-avatar"
              style={{ background: u.avatarColor }}
            />
            <span className="who-online-name" title={u.nickname}>
              {u.nickname}
            </span>
            {u.playingGame && (
              <span className="who-online-playing" title={`正在玩 ${u.playingGame}`}>
                玩《{u.playingGame.length > 10 ? u.playingGame.slice(0, 10) + "…" : u.playingGame}》
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
