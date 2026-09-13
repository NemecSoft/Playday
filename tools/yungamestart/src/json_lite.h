// YunGameStart（C++ 版）— 极简 JSON 扫描。
//
// 为什么不引第三方库：程序只有两个读取需求，都是为了从几百字节里取出几个字段 ——
//   1) config.json：settings.yunGameUserListPath / settings.defaultGameRootPath
//   2) 用户表：数组里每条记录，找 UserIpAddress 等于本机外网 IP 的那条，取其 UserLevel
// 所以这里只做"扫描"：按 JSON 的字符串/转义规则切出顶层对象，再在对象里找某个键的值。
// 不建树、不处理任意嵌套 —— 够用且没有依赖。
#pragma once

#include <string>
#include <vector>

namespace ygs {

/** JSON 字符串反转义（只处理常见转义；\uXXXX 按 UTF-8 还原，代理对不特殊处理）。 */
inline std::string JsonUnescape(const std::string& s) {
    std::string out;
    out.reserve(s.size());
    for (size_t i = 0; i < s.size(); i++) {
        if (s[i] != '\\' || i + 1 >= s.size()) {
            out.push_back(s[i]);
            continue;
        }
        char c = s[++i];
        switch (c) {
            case 'n': out.push_back('\n'); break;
            case 't': out.push_back('\t'); break;
            case 'r': out.push_back('\r'); break;
            case 'b': out.push_back('\b'); break;
            case 'f': out.push_back('\f'); break;
            case '/': out.push_back('/'); break;
            case '\\': out.push_back('\\'); break;
            case '"': out.push_back('"'); break;
            case 'u': {
                if (i + 4 >= s.size()) break;
                unsigned cp = 0;
                for (int k = 0; k < 4; k++) {
                    char h = s[++i];
                    cp <<= 4;
                    if (h >= '0' && h <= '9') cp |= (unsigned)(h - '0');
                    else if (h >= 'a' && h <= 'f') cp |= (unsigned)(h - 'a' + 10);
                    else if (h >= 'A' && h <= 'F') cp |= (unsigned)(h - 'A' + 10);
                }
                // 基本多文种平面：编码成 UTF-8（IP/门店名用不到 BMP 以外，代理对直接跳过）
                if (cp < 0x80) {
                    out.push_back((char)cp);
                } else if (cp < 0x800) {
                    out.push_back((char)(0xC0 | (cp >> 6)));
                    out.push_back((char)(0x80 | (cp & 0x3F)));
                } else {
                    out.push_back((char)(0xE0 | (cp >> 12)));
                    out.push_back((char)(0x80 | ((cp >> 6) & 0x3F)));
                    out.push_back((char)(0x80 | (cp & 0x3F)));
                }
                break;
            }
            default: out.push_back(c); break;
        }
    }
    return out;
}

namespace detail {

inline bool IsWs(char c) { return c == ' ' || c == '\t' || c == '\r' || c == '\n'; }

/** 从 p（应为 `"`）读出一个 JSON 字符串，返回其原始内容（未反转义）；不吃引号则返回 false。 */
inline bool ReadString(const std::string& s, size_t& p, std::string& out) {
    if (p >= s.size() || s[p] != '"') return false;
    p++;
    std::string raw;
    while (p < s.size()) {
        char c = s[p];
        if (c == '\\') {
            if (p + 1 >= s.size()) return false;
            raw.push_back(c);
            raw.push_back(s[p + 1]);
            p += 2;
            continue;
        }
        if (c == '"') {
            p++;
            out = JsonUnescape(raw);
            return true;
        }
        raw.push_back(c);
        p++;
    }
    return false;
}

/** 跳过 p 处的一个 JSON 值（字符串/数字/对象/数组/true/false/null），返回结束位置后一位。 */
inline size_t SkipValue(const std::string& s, size_t p) {
    while (p < s.size() && IsWs(s[p])) p++;
    if (p >= s.size()) return p;
    char c = s[p];
    if (c == '"') {
        std::string tmp;
        size_t q = p;
        if (ReadString(s, q, tmp)) return q;
        return p + 1;
    }
    if (c == '{' || c == '[') {
        char open = c, close = (c == '{') ? '}' : ']';
        int depth = 0;
        while (p < s.size()) {
            char d = s[p];
            if (d == '"') {
                std::string tmp;
                size_t q = p;
                if (ReadString(s, q, tmp)) {
                    p = q;
                    continue;
                }
                p++;
                continue;
            }
            if (d == open) depth++;
            else if (d == close) {
                depth--;
                if (depth == 0) return p + 1;
            }
            p++;
        }
        return p;
    }
    while (p < s.size() && s[p] != ',' && s[p] != '}' && s[p] != ']') p++;
    return p;
}

}  // namespace detail

/**
 * 在整个文档里找 `"key"` 的字符串值（第一个匹配）。
 * 对 config.json 够用：我们要的两个键在文件里只出现一次。
 */
inline bool JsonFindString(const std::string& doc, const char* key, std::string& out) {
    std::string needle = std::string("\"") + key + "\"";
    size_t from = 0;
    while (true) {
        size_t pos = doc.find(needle, from);
        if (pos == std::string::npos) return false;
        size_t p = pos + needle.size();
        while (p < doc.size() && detail::IsWs(doc[p])) p++;
        if (p >= doc.size() || doc[p] != ':') {  // 是别的键的值里出现的同名字符串，继续找
            from = pos + 1;
            continue;
        }
        p++;
        while (p < doc.size() && detail::IsWs(doc[p])) p++;
        std::string val;
        if (!detail::ReadString(doc, p, val)) {  // 不是字符串（数字/对象…）：不算命中
            from = pos + 1;
            continue;
        }
        out = val;
        return true;
    }
}

/** 在整个文档里找 `"key"` 的数字值（userLevel 用）。 */
inline bool JsonFindNumber(const std::string& doc, const char* key, double& out) {
    std::string needle = std::string("\"") + key + "\"";
    size_t pos = doc.find(needle);
    if (pos == std::string::npos) return false;
    size_t p = pos + needle.size();
    while (p < doc.size() && detail::IsWs(doc[p])) p++;
    if (p >= doc.size() || doc[p] != ':') return false;
    p++;
    while (p < doc.size() && detail::IsWs(doc[p])) p++;
    size_t start = p;
    while (p < doc.size() && (isdigit((unsigned char)doc[p]) || doc[p] == '-' || doc[p] == '+' ||
                              doc[p] == '.' || doc[p] == 'e' || doc[p] == 'E')) {
        p++;
    }
    if (p == start) return false;
    out = atof(doc.substr(start, p - start).c_str());
    return true;
}

/** 把"顶层数组"切成一个个对象的原文（`{...}`），用于逐条扫用户表。 */
inline std::vector<std::string> JsonArrayObjects(const std::string& doc) {
    std::vector<std::string> out;
    size_t p = 0;
    while (p < doc.size() && detail::IsWs(doc[p])) p++;
    if (p >= doc.size() || doc[p] != '[') {
        // 单对象（用户表也可能只有一条、不是数组）也认
        if (p < doc.size() && doc[p] == '{') out.push_back(doc.substr(p, detail::SkipValue(doc, p) - p));
        return out;
    }
    p++;
    while (p < doc.size()) {
        while (p < doc.size() && detail::IsWs(doc[p])) p++;
        if (p >= doc.size() || doc[p] == ']') break;
        if (doc[p] == ',') {
            p++;
            continue;
        }
        if (doc[p] == '{') {
            size_t end = detail::SkipValue(doc, p);
            out.push_back(doc.substr(p, end - p));
            p = end;
            continue;
        }
        p = detail::SkipValue(doc, p);  // 数组里混了非对象，跳过
    }
    return out;
}

}  // namespace ygs
