// YunGameStart（C++ 版）— 一次 HTTP/HTTPS GET。
//
// 用系统自带的 WinHTTP：不引 libcurl（那要给 exe 带上证书与 DLL），
// 而 IP 服务全是 https，WinHTTP 直接用系统的根证书，最省事。
// 自动跟随重定向 —— 这一类服务常见 http→https 或带路径的跳转。
#pragma once

#include <windows.h>
#include <winhttp.h>

#include <string>

#include "util.h"

namespace ygs {

struct HttpResult {
    bool ok = false;
    int status = 0;
    std::string body;
    std::string error;
};

namespace detail {

/** 句柄 RAII（Win32 句柄忘记关就会漏，早期版本踩过）。 */
struct WinHttpHandle {
    HINTERNET h = nullptr;
    explicit WinHttpHandle(HINTERNET v) : h(v) {}
    ~WinHttpHandle() {
        if (h) WinHttpCloseHandle(h);
    }
    WinHttpHandle(const WinHttpHandle&) = delete;
    WinHttpHandle& operator=(const WinHttpHandle&) = delete;
    explicit operator bool() const { return h != nullptr; }
};

}  // namespace detail

/**
 * GET 一个 URL，把响应体读成字符串（去首尾空白，最多 8KB —— 我们只取一个 IP）。
 * 超时默认 5 秒，与原版一致；失败时 error 里写明原因（连接/超时/HTTP 码）。
 */
inline HttpResult HttpGet(const std::wstring& url, int timeoutMs = 5000) {
    HttpResult r;

    URL_COMPONENTS uc{};
    uc.dwStructSize = sizeof(uc);
    wchar_t host[256] = {0};
    wchar_t path[2048] = {0};
    wchar_t extra[1024] = {0};
    uc.lpszHostName = host;
    uc.dwHostNameLength = (DWORD)(sizeof(host) / sizeof(host[0]) - 1);
    uc.lpszUrlPath = path;
    uc.dwUrlPathLength = (DWORD)(sizeof(path) / sizeof(path[0]) - 1);
    uc.lpszExtraInfo = extra;
    uc.dwExtraInfoLength = (DWORD)(sizeof(extra) / sizeof(extra[0]) - 1);

    if (!WinHttpCrackUrl(url.c_str(), (DWORD)url.size(), 0, &uc)) {
        r.error = "URL 解析失败";
        return r;
    }
    if (uc.nScheme != INTERNET_SCHEME_HTTP && uc.nScheme != INTERNET_SCHEME_HTTPS) {
        r.error = "只支持 http/https";
        return r;
    }

    detail::WinHttpHandle session(WinHttpOpen(L"YunGameStart/1.0", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                              WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0));
    if (!session) {
        r.error = "WinHttpOpen 失败";
        return r;
    }
    WinHttpSetTimeouts(session.h, timeoutMs, timeoutMs, timeoutMs, timeoutMs);
    DWORD policy = WINHTTP_OPTION_REDIRECT_POLICY_ALWAYS;
    WinHttpSetOption(session.h, WINHTTP_OPTION_REDIRECT_POLICY, &policy, sizeof(policy));

    std::wstring hostStr(host, uc.dwHostNameLength);
    detail::WinHttpHandle connect(WinHttpConnect(session.h, hostStr.c_str(), uc.nPort, 0));
    if (!connect) {
        r.error = "连接失败（" + WideToUtf8(hostStr) + "）";
        return r;
    }

    std::wstring pathStr(path, uc.dwUrlPathLength);
    if (uc.dwExtraInfoLength > 0) pathStr += std::wstring(extra, uc.dwExtraInfoLength);
    if (pathStr.empty()) pathStr = L"/";

    DWORD flags = (uc.nScheme == INTERNET_SCHEME_HTTPS) ? WINHTTP_FLAG_SECURE : 0;
    detail::WinHttpHandle request(
        WinHttpOpenRequest(connect.h, L"GET", pathStr.c_str(), nullptr, WINHTTP_NO_REFERER,
                           WINHTTP_DEFAULT_ACCEPT_TYPES, flags));
    if (!request) {
        r.error = "创建请求失败";
        return r;
    }
    // 原版也显式设了 UA/Accept：有的服务没有 UA 会直接拒绝。
    WinHttpAddRequestHeaders(request.h,
                             L"User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                             L"(KHTML, like Gecko) Chrome/117.0.0.0 Safari/537.36",
                             (DWORD)-1L, WINHTTP_ADDREQ_FLAG_ADD);
    WinHttpAddRequestHeaders(request.h, L"Accept: text/plain", (DWORD)-1L, WINHTTP_ADDREQ_FLAG_ADD);
    WinHttpAddRequestHeaders(request.h, L"Cache-Control: no-cache", (DWORD)-1L, WINHTTP_ADDREQ_FLAG_ADD);

    if (!WinHttpSendRequest(request.h, WINHTTP_NO_ADDITIONAL_HEADERS, 0, WINHTTP_NO_REQUEST_DATA, 0, 0, 0)) {
        r.error = "发送请求失败（错误码 " + std::to_string(GetLastError()) + "）";
        return r;
    }
    if (!WinHttpReceiveResponse(request.h, nullptr)) {
        r.error = "读取响应失败（错误码 " + std::to_string(GetLastError()) + "）";
        return r;
    }

    DWORD status = 0;
    DWORD len = sizeof(status);
    WinHttpQueryHeaders(request.h, WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &status, &len, WINHTTP_NO_HEADER_INDEX);
    r.status = (int)status;

    std::string body;
    for (;;) {
        DWORD avail = 0;
        if (!WinHttpQueryDataAvailable(request.h, &avail) || avail == 0) break;
        std::string chunk(avail, '\0');
        DWORD read = 0;
        if (!WinHttpReadData(request.h, &chunk[0], avail, &read) || read == 0) break;
        chunk.resize(read);
        body += chunk;
        if (body.size() > 8192) break;  // 只取一个 IP，别被异常响应拖住
    }
    r.body = TrimAscii(body);

    if (status != 200) {
        r.error = "HTTP " + std::to_string(status);
        return r;
    }
    if (r.body.empty()) {
        r.error = "响应为空";
        return r;
    }
    r.ok = true;
    return r;
}

}  // namespace ygs
