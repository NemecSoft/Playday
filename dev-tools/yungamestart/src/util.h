// YunGameStart（C++ 版）— 通用小工具：宽窄字符串、路径、日志、base64/XOR、IPv4 校验。
//
// 为什么这些放头文件：整个程序只有一个翻译单元（main.cpp），编译就是一条 g++ 命令，
// 不引入任何第三方库（HTTP 用 WinHTTP、快捷方式用 IShellLink，都是系统自带）。
#pragma once

#include <windows.h>

#include <cstdarg>
#include <cstdio>
#include <ctime>
#include <string>
#include <vector>

namespace ygs {

// ---------------------------------------------------------------- 字符串

inline std::wstring Utf8ToWide(const std::string& s) {
    if (s.empty()) return std::wstring();
    int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0);
    std::wstring out((size_t)n, L'\0');
    MultiByteToWideChar(CP_UTF8, 0, s.c_str(), (int)s.size(), &out[0], n);
    return out;
}

inline std::string WideToUtf8(const std::wstring& s) {
    if (s.empty()) return std::string();
    int n = WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), nullptr, 0, nullptr, nullptr);
    std::string out((size_t)n, '\0');
    WideCharToMultiByte(CP_UTF8, 0, s.c_str(), (int)s.size(), &out[0], n, nullptr, nullptr);
    return out;
}

/** 去掉首尾的 ASCII 空白（外网 IP 服务返回的字符串常带换行）。 */
inline std::string TrimAscii(const std::string& s) {
    size_t a = 0, b = s.size();
    while (a < b && (unsigned char)s[a] <= ' ') a++;
    while (b > a && (unsigned char)s[b - 1] <= ' ') b--;
    return s.substr(a, b - a);
}

// ---------------------------------------------------------------- 路径

/** 本 exe 所在目录（末尾不带反斜杠）。 */
inline std::wstring ExeDir() {
    wchar_t buf[MAX_PATH * 2] = {0};
    DWORD n = GetModuleFileNameW(nullptr, buf, (DWORD)(sizeof(buf) / sizeof(buf[0])));
    std::wstring p(buf, n);
    size_t pos = p.find_last_of(L"\\/");
    return pos == std::wstring::npos ? p : p.substr(0, pos);
}

inline std::wstring JoinPath(const std::wstring& a, const std::wstring& b) {
    if (a.empty()) return b;
    if (b.empty()) return a;
    std::wstring out = a;
    if (out.back() != L'\\' && out.back() != L'/') out += L'\\';
    return out + b;
}

/** 取上一级目录（`X:\a\b` → `X:\a`）。 */
inline std::wstring ParentDir(const std::wstring& p) {
    size_t pos = p.find_last_of(L"\\/");
    return pos == std::wstring::npos ? p : p.substr(0, pos);
}

/** 把 `/` 统一成 `\`（config.json 里的路径都是正斜杠）。 */
inline std::wstring NormalizeSlashes(std::wstring p) {
    for (auto& c : p) {
        if (c == L'/') c = L'\\';
    }
    return p;
}

inline bool FileExists(const std::wstring& p) {
    DWORD a = GetFileAttributesW(p.c_str());
    return a != INVALID_FILE_ATTRIBUTES && !(a & FILE_ATTRIBUTE_DIRECTORY);
}

inline bool DirExists(const std::wstring& p) {
    DWORD a = GetFileAttributesW(p.c_str());
    return a != INVALID_FILE_ATTRIBUTES && (a & FILE_ATTRIBUTE_DIRECTORY);
}

/** 读文件（按字节，UTF-8 原样），失败返回空串并把 ok 置 false。 */
inline std::string ReadFileBytes(const std::wstring& p, bool* ok = nullptr) {
    if (ok) *ok = false;
    HANDLE h = CreateFileW(p.c_str(), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE, nullptr,
                           OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (h == INVALID_HANDLE_VALUE) return std::string();
    LARGE_INTEGER size{};
    if (!GetFileSizeEx(h, &size) || size.QuadPart <= 0) {
        CloseHandle(h);
        return std::string();
    }
    std::string out((size_t)size.QuadPart, '\0');
    DWORD read = 0;
    BOOL r = ReadFile(h, &out[0], (DWORD)out.size(), &read, nullptr);
    CloseHandle(h);
    if (!r) return std::string();
    out.resize(read);
    if (ok) *ok = true;
    return out;
}

// ---------------------------------------------------------------- 日志

// 日志同时写文件（始终）和控制台（-d 时）。文件用 UTF-8，控制台用 WriteConsoleW，
// 两边都不会被控制台代码页搞乱。
inline std::wstring g_logPath;
inline bool g_console = false;

inline void LogRaw(const std::string& utf8Line) {
    if (!g_logPath.empty()) {
        HANDLE h = CreateFileW(g_logPath.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ, nullptr,
                               OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (h != INVALID_HANDLE_VALUE) {
            DWORD written = 0;
            WriteFile(h, utf8Line.data(), (DWORD)utf8Line.size(), &written, nullptr);
            CloseHandle(h);
        }
    }
    if (g_console) {
        std::wstring w = Utf8ToWide(utf8Line);
        DWORD written = 0;
        WriteConsoleW(GetStdHandle(STD_OUTPUT_HANDLE), w.c_str(), (DWORD)w.size(), &written, nullptr);
    }
}

/**
 * 写一行日志。级别只是给 grep 用的前缀：INFO / WARN / ERROR。
 * 文件超过 512KB 时在 LogInit 里滚动成 .old（开机跑一次，不滚动会无限长）。
 */
inline void LogInit(const std::wstring& logPath, bool console) {
    g_logPath = logPath;
    g_console = console;
    if (FileExists(logPath)) {
        WIN32_FILE_ATTRIBUTE_DATA fad{};
        if (GetFileAttributesExW(logPath.c_str(), GetFileExInfoStandard, &fad)) {
            ULONGLONG size = ((ULONGLONG)fad.nFileSizeHigh << 32) | fad.nFileSizeLow;
            if (size > 512ull * 1024ull) {
                MoveFileExW(logPath.c_str(), (logPath + L".old").c_str(), MOVEFILE_REPLACE_EXISTING);
            }
        }
    }
}

inline void LogLine(const char* level, const std::string& msg) {
    SYSTEMTIME st{};
    GetLocalTime(&st);
    char head[64] = {0};
    sprintf_s(head, sizeof(head), "%04d-%02d-%02d %02d:%02d:%02d [%s] ", st.wYear, st.wMonth,
              st.wDay, st.wHour, st.wMinute, st.wSecond, level);
    LogRaw(std::string(head) + msg + "\r\n");
}

inline void LogFmt(const char* level, const char* fmt, ...) {
    char buf[4096] = {0};
    va_list ap;
    va_start(ap, fmt);
    vsnprintf(buf, sizeof(buf) - 1, fmt, ap);
    va_end(ap);
    LogLine(level, std::string(buf));
}

/** 宽字符串版的日志（省得每个调用点都 WideToUtf8）。 */
inline void LogW(const char* level, const std::wstring& msg) {
    LogLine(level, WideToUtf8(msg));
}

#define LOGI(...) ::ygs::LogFmt("INFO ", __VA_ARGS__)
#define LOGW(...) ::ygs::LogFmt("WARN ", __VA_ARGS__)
#define LOGE(...) ::ygs::LogFmt("ERROR", __VA_ARGS__)

// ---------------------------------------------------------------- base64 + XOR

/** 标准 base64 解码；含非法字符或长度不对时返回空串（调用方据此判断"不是密文"）。 */
inline std::string Base64Decode(const std::string& in) {
    static const char* kTable = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    int rev[256];
    for (int i = 0; i < 256; i++) rev[i] = -1;
    for (int i = 0; i < 64; i++) rev[(unsigned char)kTable[i]] = i;

    std::string out;
    out.reserve(in.size() / 4 * 3);
    int buf = 0, bits = 0, pad = 0;
    for (unsigned char c : in) {
        if (c == '\r' || c == '\n' || c == ' ' || c == '\t') continue;
        if (c == '=') {
            pad++;
            continue;
        }
        int v = rev[c];
        if (v < 0) return std::string();
        buf = (buf << 6) | v;
        bits += 6;
        if (bits >= 8) {
            bits -= 8;
            out.push_back((char)((buf >> bits) & 0xFF));
        }
    }
    // base64 的字符数必须是 4 的倍数（含 `=`），否则不是 base64。
    size_t solid = 0;
    for (unsigned char c : in) {
        if (c != '\r' && c != '\n' && c != ' ' && c != '\t') solid++;
    }
    if (solid == 0 || solid % 4 != 0 || pad > 2) return std::string();
    return out;
}

/** 逐字节 XOR（密钥循环）；XOR 是对称运算，加密解密同一个函数。 */
inline std::string XorBytes(const std::string& data, const std::string& key) {
    if (key.empty()) return data;
    std::string out = data;
    for (size_t i = 0; i < out.size(); i++) out[i] = (char)((unsigned char)out[i] ^ (unsigned char)key[i % key.size()]);
    return out;
}

/**
 * 把"可能是明文、也可能是原版 JsonCrypt 密文"的内容解成明文。
 * 判别依据与客户端 shared/userLevel.ts 的 parseUserListRaw 完全一致：
 * 以 `[` 或 `{` 开头 → 明文；否则按 base64 + XOR 解一次。
 */
inline std::string DecodeMaybeEncrypted(const std::string& raw, const std::string& key) {
    std::string text = TrimAscii(raw);
    if (text.empty()) return std::string();
    if (text[0] == '[' || text[0] == '{') return text;
    std::string bytes = Base64Decode(text);
    if (bytes.empty()) return std::string();  // 不是合法 base64：交给调用方报错
    return XorBytes(bytes, key);
}

// ---------------------------------------------------------------- IPv4

/** 严格校验点分十进制 IPv4（四段、每段 0~255、无多余字符）。 */
inline bool IsIpv4(const std::string& s) {
    if (s.empty() || s.size() > 15) return false;
    int part = 0, dots = 0;
    size_t i = 0;
    while (i <= s.size()) {
        if (i == s.size() || s[i] == '.') {
            if (part > 255) return false;
            if (i == s.size()) break;
            dots++;
            if (dots > 3) return false;
            part = 0;
            i++;
            continue;
        }
        if (s[i] < '0' || s[i] > '9') return false;
        // 前导 0（如 01.2.3.4）不接受：IP 服务不会这么返回，出现即说明不是 IP。
        if ((i == 0 || s[i - 1] == '.') && s[i] == '0' && i + 1 < s.size() && s[i + 1] != '.') return false;
        part = part * 10 + (s[i] - '0');
        i++;
    }
    return dots == 3;
}

}  // namespace ygs
