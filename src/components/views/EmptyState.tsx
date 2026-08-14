// Empty state shown when there are no games (or filters exclude everything).

import { Gamepad2 } from "lucide-react";
import { useI18n } from "../../i18n";

interface Props {
  hasGames: boolean;
}

export default function EmptyState({ hasGames }: Props) {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3.5 text-dim">
      <div className="opacity-40">
        <Gamepad2 size={52} />
      </div>
      <h2 className="text-lg text-primary-text">
        {hasGames ? t("empty_noMatch") : t("empty_libraryEmpty")}
      </h2>
      <p>{hasGames ? t("empty_noMatchHint") : t("empty_libraryEmptyHint")}</p>
    </div>
  );
}
