// ============================================================================
//  YunGameStart（C++ 版）— 开机自启：判定本机是黄金版还是钻石版，并在桌面建对应快捷方式
// ----------------------------------------------------------------------------
//  这是原 WPF 程序 YunGameTools/YunGameStart 的等价重写（用户要求用 C++，且更无感）。
//  核心链路（与客户端 shared/userLevel.ts 同一套规则）：
//    1. 从 config.json 找路径（用户表 / 游戏根）
//    2. 取本机**外网 IP**（三个服务轮流试）
//    3. 读用户表（明文或原版 JsonCrypt 密文都吃），按 IP 命中 → 取等级
//    4. 建/更新桌面快捷方式：黄金版用 1.ico、钻石版用 2.ico
//
//  与原版的三处**有意的差异**（详见 docs/design/yungamestart.md）：
//    · 等级判定按客户端的权威规则：**只有 UserLevel == 2 才是钻石**，其它（含脏值 3）都算黄金；
//      原版是"≠1 就钻石"。
//    · 外网 IP 取不到时**不动桌面**（保持现状）——原版会当成黄金版建快捷方式，
//      在"本来是钻石版、只是开机时网络没起来"的机器上会把钻石快捷方式删掉换成黄金，属于降级事故。
//    · 建完当前等级的快捷方式后，删掉**另一个等级**的 .lnk（原版会两个都留着，其中一个必然是错的）。
//
//  运行形态：GUI 子系统（无窗口、开机不打扰），过程写 <exe 同目录>\yungamestart.log。
//  用法：yungamestart.exe [-d] [-n] [--config <文件>] [--lnk-dir <目录>] [--ip <地址>]
//    -d            附带一个控制台显示每一步（排障；原版也有 -d）
//    -n            只算不写：不建/不删快捷方式（排障）
//    --config      指定 config.json（默认 <exe 上级目录>\config.json）
//    --lnk-dir     快捷方式写到别的目录（排障；默认是当前用户桌面）
//    --ip          跳过外网 IP 探测，直接用给的值（排障：模拟某门店）
// ============================================================================
#include <windows.h>

#include <shellapi.h>  // CommandLineToArgvW

#include <conio.h>  // _getch（-d 结束时暂停）
#include <string>
#include <vector>

#include "http.h"
#include "json_lite.h"
#include "shortcut.h"
#include "util.h"

using namespace ygs;

namespace {

// ---- 常量（改这里就够了）----------------------------------------------------

/** 启动器文件名。与 build.config.ts 的 CLIENT_EXE_NAME / electron-builder.yml 的 win.executableName 一致。 */
const wchar_t* const kLauncherExe = L"PlayniteUI.exe";

/** 用户表加密密钥（原版 JsonCrypt 固定密钥，别改）。 */
const char* const kUserListKey = "yungameplaynite";

/** 桌面快捷方式名（原文就是两个空格；沿用老名字，老用户不觉得换了东西）。 */
const wchar_t* const kNameGold = L"YunGame  黄金版";
const wchar_t* const kNameDiamond = L"YunGame  钻石版";

/** 外网 IP 服务，顺序与原版一致。 */
const wchar_t* const kIpServices[] = {
    L"https://ipv4.icanhazip.com",
    L"https://v4.ident.me",
    L"https://ipinfo.io/ip",
};

/** 用户表找不到时的兜底位置（与原版 appsettings 的 Primary / Fallback 对应）。 */
const wchar_t* const kUserListFallbacks[] = {
    L"X:\\YunGame\\PlayNite\\YunGameConfig\\YunGame_UserList.json",
    L"D:\\YunGame\\PlayNite\\YunGameConfig\\YunGame_UserList.json",
};

// ---- 参数 ------------------------------------------------------------------

struct Options {
    bool debug = false;       // -d
    bool dryRun = false;      // -n
    std::wstring configPath;  // --config
    std::wstring lnkDir;      // --lnk-dir
    std::wstring ipOverride;  // --ip
};

void PrintUsage() {
    LogLine("INFO ", "用法: yungamestart.exe [-d] [-n] [--config <文件>] [--lnk-dir <目录>] [--ip <地址>]");
}

Options ParseArgs() {
    Options o;
    int argc = 0;
    LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
    if (!argv) return o;
    for (int i = 1; i < argc; i++) {
        std::wstring a = argv[i];
        auto next = [&](std::wstring& dst) {
            if (i + 1 < argc) dst = argv[++i];
        };
        if (a == L"-d" || a == L"--debug") o.debug = true;
        else if (a == L"-n" || a == L"--dry-run") o.dryRun = true;
        else if (a == L"--config") next(o.configPath);
        else if (a == L"--lnk-dir") next(o.lnkDir);
        else if (a == L"--ip") next(o.ipOverride);
        else if (a == L"-h" || a == L"--help" || a == L"-?") { o.debug = true; PrintUsage(); }
        else {
            LogW("WARN ", L"忽略未知参数: " + a);
        }
    }
    LocalFree(argv);
    return o;
}

// ---- config.json -----------------------------------------------------------

struct AppConfig {
    bool loaded = false;
    std::wstring sourceFile;      // 实际读到的 config.json
    std::wstring userListPath;    // settings.yunGameUserListPath
    std::wstring gameRoot;        // settings.defaultGameRootPath
};

/** 按优先级找 config.json：--config → <exe 上级目录> → <exe 同目录>。 */
AppConfig LoadConfig(const Options& o, const std::wstring& exeDir) {
    AppConfig cfg;
    std::vector<std::wstring> candidates;
    if (!o.configPath.empty()) candidates.push_back(o.configPath);
    candidates.push_back(JoinPath(ParentDir(exeDir), L"config.json"));
    candidates.push_back(JoinPath(exeDir, L"config.json"));

    for (const auto& path : candidates) {
        if (!FileExists(path)) continue;
        bool ok = false;
        std::string raw = ReadFileBytes(path, &ok);
        if (!ok || raw.empty()) {
            LogW("WARN ", L"config.json 读不出来（跳过）: " + path);
            continue;
        }
        cfg.sourceFile = path;
        cfg.loaded = true;
        std::string v;
        if (JsonFindString(raw, "yunGameUserListPath", v)) {
            cfg.userListPath = NormalizeSlashes(Utf8ToWide(TrimAscii(v)));
        }
        if (JsonFindString(raw, "defaultGameRootPath", v)) {
            cfg.gameRoot = NormalizeSlashes(Utf8ToWide(TrimAscii(v)));
        }
        LogW("INFO ", L"config.json: " + path);
        return cfg;
    }
    LOGW("没找到 config.json（试过 %d 个位置），改用内置默认路径", (int)candidates.size());
    return cfg;
}

// ---- 用户表 ----------------------------------------------------------------

struct LevelResult {
    bool ok = false;           // 用户表读到了、解开了、解析了
    bool matched = false;      // 本机 IP 在名单里
    int level = 1;             // 1 = 黄金，2 = 钻石（只有命中且 UserLevel==2 才是钻石）
    std::wstring cafeName;     // 命中的门店名
    std::wstring error;
};

/** 在一个用户表对象里取字符串字段（兼容 PascalCase 与 snake_case）。 */
bool PickString(const std::string& obj, const char* a, const char* b, std::string& out) {
    return JsonFindString(obj, a, out) || (b && JsonFindString(obj, b, out));
}

bool PickNumber(const std::string& obj, const char* a, const char* b, double& out) {
    return JsonFindNumber(obj, a, out) || (b && JsonFindNumber(obj, b, out));
}

/**
 * 判定本机等级 —— 与客户端 shared/userLevel.ts 的 resolveUserLevel 保持一致：
 * 命中 IP 的等级只有**恰好 2** 才算钻石，其余（1 / 脏值 / 没命中）都是黄金。
 */
LevelResult ResolveLevel(const std::string& plainJson, const std::string& ip) {
    LevelResult r;
    if (plainJson.empty()) {
        r.error = L"用户表内容为空";
        return r;
    }
    std::vector<std::string> records;
    try {
        records = JsonArrayObjects(plainJson);
    } catch (...) {
        r.error = L"解析用户表时出错";
        return r;
    }
    if (records.empty()) {
        r.error = L"用户表里没有记录（格式不对？）";
        return r;
    }
    for (const auto& obj : records) {
        std::string recIp;
        if (!PickString(obj, "UserIpAddress", "user_ip_address", recIp)) continue;
        if (TrimAscii(recIp) != ip) continue;

        r.matched = true;
        double level = 0;
        PickNumber(obj, "UserLevel", "user_level", level);
        r.level = ((int)level == 2) ? 2 : 1;  // 只有 2 是钻石
        std::string name;
        if (PickString(obj, "UserName", "user_name", name)) r.cafeName = Utf8ToWide(name);
        r.ok = true;
        return r;
    }
    r.ok = true;  // 表读到了，只是没命中 → 黄金版
    return r;
}

// ---- 外网 IP ---------------------------------------------------------------

struct IpResult {
    std::string ip;
    std::string service;
};

/** 三个服务轮流试，每个重试 2 次（与原版一致）。返回空串表示全失败。 */
IpResult GetPublicIp() {
    IpResult out;
    const int kAttemptsPerService = 2;
    for (auto* service : kIpServices) {
        for (int attempt = 1; attempt <= kAttemptsPerService; attempt++) {
            HttpResult r = HttpGet(service);
            if (r.ok && IsIpv4(r.body)) {
                LogW("INFO ", L"外网 IP: " + Utf8ToWide(r.body) + L"（来源 " + service + L"，第 " +
                                  std::to_wstring(attempt) + L" 次尝试）");
                out.ip = r.body;
                out.service = WideToUtf8(service);
                return out;
            }
            std::wstring why = r.ok ? (L"响应不是合法 IPv4: " + Utf8ToWide(r.body))
                                    : Utf8ToWide(r.error);
            LogW("WARN ", std::wstring(L"取 IP 失败: ") + service + L" 第 " + std::to_wstring(attempt) +
                             L"/" + std::to_wstring(kAttemptsPerService) + L" 次：" + why);
            if (attempt < kAttemptsPerService) Sleep(100 * attempt);
        }
    }
    return out;
}

// ---- 主流程 ----------------------------------------------------------------

int DoRun(const Options& o) {
    const std::wstring exeDir = ExeDir();
    if (exeDir.empty()) {
        LOGE("拿不到自身所在目录，无法继续");
        return 1;
    }
    LogInit(JoinPath(exeDir, L"yungamestart.log"), o.debug);
    LOGI("---- YunGameStart 启动（%s %s 编译）----", __DATE__, __TIME__);
    LogW("INFO ", L"exe 目录: " + exeDir);
    if (o.dryRun) LOGI("dry-run：只算不写（不建、不删快捷方式）");

    // 1) config.json → 路径
    AppConfig cfg = LoadConfig(o, exeDir);
    std::wstring gameRoot = cfg.gameRoot;
    if (gameRoot.empty()) {
        gameRoot = ParentDir(exeDir);  // 惯例：yungamestart\ 的上一级就是客户端目录
        LogW("WARN ", L"config.json 没给 defaultGameRootPath，用 exe 上级目录: " + gameRoot);
    }
    std::wstring launcher = JoinPath(gameRoot, kLauncherExe);
    if (!FileExists(launcher)) {
        LogW("WARN ", L"启动器还不在（稍后部署也会生效，快捷方式先建好）: " + launcher);
    }

    // 用户表：config.json 优先，其次原版那两个兜底位置
    std::vector<std::wstring> userListCandidates;
    if (!cfg.userListPath.empty()) userListCandidates.push_back(cfg.userListPath);
    else {
        for (auto* p : kUserListFallbacks) userListCandidates.push_back(p);
    }
    std::wstring userListPath;
    for (const auto& p : userListCandidates) {
        if (FileExists(p)) {
            userListPath = p;
            break;
        }
    }

    // 2) 外网 IP（拿不到就**不动桌面**，见文件头说明）
    std::string ip;
    if (!o.ipOverride.empty()) {
        ip = WideToUtf8(o.ipOverride);
        LOGI("使用 --ip 指定的地址: %s", ip.c_str());
    } else {
        IpResult ir = GetPublicIp();
        ip = ir.ip;
    }
    if (ip.empty() || !IsIpv4(ip)) {
        LOGE("外网 IP 没取到 —— 跳过快捷方式（保持桌面现状，避免把钻石版误降成黄金版）");
        return 2;
    }

    // 3) 用户表 → 等级
    LevelResult lv;
    if (userListPath.empty()) {
        lv.error = L"用户表文件不存在（config.json 的 yunGameUserListPath 与兜底位置都没有）";
    } else {
        LogW("INFO ", L"用户表: " + userListPath);
        bool ok = false;
        std::string raw = ReadFileBytes(userListPath, &ok);
        std::string plain = ok ? DecodeMaybeEncrypted(raw, kUserListKey) : std::string();
        if (!ok) lv.error = L"用户表读不出来";
        else if (plain.empty()) lv.error = L"用户表解密失败（既不像明文，也不是合法的 base64+XOR 密文）";
        else lv = ResolveLevel(plain, ip);
    }
    if (!lv.ok) {
        LogW("ERROR", L"判定等级失败：" + lv.error + L" —— 跳过快捷方式（保持桌面现状）");
        return 3;
    }
    if (lv.matched) {
        LogW("INFO ", L"命中用户表：" + lv.cafeName + L"（IP " + Utf8ToWide(ip) + L"）→ 等级 " +
                          std::to_wstring(lv.level) + (lv.level == 2 ? L"（钻石版）" : L"（黄金版）"));
    } else {
        LOGW("用户表里没有 IP %s 的记录 → 默认黄金版（等级 1）", ip.c_str());
    }

    // 4) 快捷方式
    const bool diamond = (lv.level == 2);
    const std::wstring lnkName = diamond ? kNameDiamond : kNameGold;
    const std::wstring lnkDir = o.lnkDir.empty() ? DesktopDir() : o.lnkDir;
    if (lnkDir.empty()) {
        LOGE("拿不到目标目录（桌面目录都取不到），无法建快捷方式");
        return 1;
    }
    const std::wstring lnkPath = JoinPath(lnkDir, lnkName + L".lnk");

    // 图标：黄金版 1.ico / 钻石版 2.ico；缺了就退回启动器自身的图标（快捷方式至少能用）
    std::wstring icon = JoinPath(exeDir, diamond ? L"2.ico" : L"1.ico");
    if (!FileExists(icon)) {
        LogW("WARN ", L"图标文件不存在: " + icon + L" —— 退回用启动器图标");
        icon = launcher;
    }

    LogW("INFO ", L"快捷方式: " + lnkPath);
    LogW("INFO ", L"  目标    : " + launcher);
    LogW("INFO ", L"  工作目录: " + gameRoot);
    LogW("INFO ", L"  图标    : " + icon);

    if (o.dryRun) {
        LOGI("dry-run：以上均未落盘");
        return 0;
    }

    std::wstring removed;
    if (RemoveSiblingShortcut(lnkDir, lnkName, removed)) {
        LogW("INFO ", L"已删除另一个等级的快捷方式: " + removed + L".lnk");
    }
    std::wstring err;
    if (!CreateShortcut(lnkPath, launcher, gameRoot, icon, err)) {
        LogW("ERROR", L"建快捷方式失败：" + err + L"（" + lnkPath + L"）");
        return 1;
    }
    LogW("INFO ", L"建快捷方式成功：" + lnkPath);
    LogW("INFO ", std::wstring(L"---- 完成：") + (diamond ? L"钻石版" : L"黄金版") + L" ----");
    return 0;
}

}  // namespace

/**
 * GUI 子系统入口（编译加 -mwindows，开机不弹黑窗）。
 * -d 时附加/创建一个控制台把过程显示出来，退出前等一下，方便网维派人肉排障。
 */
int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
    Options o = ParseArgs();

    bool createdConsole = false;
    if (o.debug) {
        if (!AttachConsole(ATTACH_PARENT_PROCESS)) {
            createdConsole = (AllocConsole() != 0);
        }
        if (createdConsole) SetConsoleTitleW(L"YunGameStart -d");
    }

    // 快捷方式走 IShellLink（COM），必须先初始化本线程的 COM，否则 CoCreateInstance 直接返回
    // CO_E_NOTINITIALIZED。（第一次实测就只得到一句"CoCreateInstance 失败"——记在这里免得再踩。）
    HRESULT hrCom = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (FAILED(hrCom)) {
        LOGE("CoInitializeEx 失败（0x%08X），快捷方式无法创建", (unsigned)hrCom);
    }

    int code = 1;
    try {
        code = DoRun(o);
    } catch (...) {
        LOGE("未捕获的异常，已中止");
        code = 1;
    }

    if (SUCCEEDED(hrCom)) CoUninitialize();

    if (o.debug) {
        LOGI("退出码 %d", code);
        if (createdConsole) {
            LogLine("INFO ", "按任意键关闭窗口…");
            (void)_getch();
        }
    }
    return code;
}
