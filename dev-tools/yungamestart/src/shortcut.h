// YunGameStart（C++ 版）— 桌面快捷方式（.lnk）。
//
// 与原版 C# 的做法一致：走 Windows 的 IShellLink COM 接口，只是从托管代码换成 C++。
// CLSID/IID 直接在源码里给出，省掉 -luuid：
//   {00021401-0000-0000-C000-000000000046}  CLSID_ShellLink
//   {000214F9-0000-0000-C000-000000000046}  IID_IShellLinkW
//   {0000010B-0000-0000-C000-000000000046}  IID_IPersistFile
// （这三个值与原版 C# 里 [Guid(...)] 标注的完全相同。）
#pragma once

#include <windows.h>
// shlobj.h 提供 IShellLinkW / SHGetFolderPathW（shell32）
#include <shlobj.h>

#include <string>

#include "util.h"

namespace ygs {

inline constexpr GUID kCLSID_ShellLink = {0x00021401, 0x0000, 0x0000,
                                          {0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}};
inline constexpr GUID kIID_IShellLinkW = {0x000214F9, 0x0000, 0x0000,
                                          {0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}};
inline constexpr GUID kIID_IPersistFile = {0x0000010B, 0x0000, 0x0000,
                                           {0xC0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46}};

/**
 * 当前用户的桌面目录。
 * CSIDL_DESKTOPDIRECTORY 与原版 C# 的 Environment.SpecialFolder.Desktop 等价
 * （都是"当前用户的桌面"，不是公共桌面）—— 网维是用哪个账号登录就用哪个桌面。
 */
inline std::wstring DesktopDir() {
    wchar_t buf[MAX_PATH] = {0};
    if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_DESKTOPDIRECTORY, nullptr, 0, buf))) return buf;
    return std::wstring();
}

/**
 * 创建/覆盖一个快捷方式。调用前必须已 CoInitializeEx。
 * 注意：**不检查 target 是否存在**（与原版不同，见 docs/design/yungamestart.md）——
 * 半部署状态下建出来也总比桌面上什么都没有更容易发现问题；调用方会另行记日志。
 */
inline bool CreateShortcut(const std::wstring& lnkPath, const std::wstring& target,
                           const std::wstring& workDir, const std::wstring& iconPath,
                           std::wstring& err) {
    IShellLinkW* link = nullptr;
    HRESULT hr = CoCreateInstance(kCLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER, kIID_IShellLinkW,
                                  (void**)&link);
    if (FAILED(hr) || !link) {
        err = L"CoCreateInstance(ShellLink) 失败";
        return false;
    }
    link->SetPath(target.c_str());
    link->SetWorkingDirectory(workDir.c_str());
    if (!iconPath.empty()) link->SetIconLocation(iconPath.c_str(), 0);

    IPersistFile* pf = nullptr;
    hr = link->QueryInterface(kIID_IPersistFile, (void**)&pf);
    if (FAILED(hr) || !pf) {
        link->Release();
        err = L"QueryInterface(IPersistFile) 失败";
        return false;
    }
    hr = pf->Save(lnkPath.c_str(), TRUE);  // TRUE = 覆盖同名 .lnk
    pf->Release();
    link->Release();
    if (FAILED(hr)) {
        err = L"保存 .lnk 失败（桌子可能只读或路径不对）";
        return false;
    }
    return true;
}

/**
 * 删掉"另一个等级"的快捷方式。
 *
 * 与原版的差别：原版只建当前等级那一个，等级变化（黄金→钻石）后桌面上会**同时留着两个**，
 * 其中一个是错的（图标和名字都在骗人）。这里把兄弟快捷方式删掉，保证桌面上只有一个、且是对的。
 */
inline bool RemoveSiblingShortcut(const std::wstring& dir, const std::wstring& keepName,
                                  std::wstring& removedName) {
    const wchar_t* kBoth[2] = {L"YunGame  黄金版", L"YunGame  钻石版"};
    bool any = false;
    for (auto* name : kBoth) {
        if (keepName == name) continue;
        std::wstring p = JoinPath(dir, std::wstring(name) + L".lnk");
        if (FileExists(p) && DeleteFileW(p.c_str())) {
            any = true;
            removedName = name;
        }
    }
    return any;
}

}  // namespace ygs
