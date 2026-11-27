#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
printf '\n816 現金出納帳の自動設定\n\n'
printf '指定の専用アプリを確認・登録し、公開URLを発行します。既存の帳簿明細は上書きしません。\n'
printf '初回の管理者ログイン時に、元帳の一般公開を解除し、保存用タブと非公開写真フォルダを作成します。\n'
printf '既存の個別共有は残します。Googleの承認が必要です。認証情報はこのMac内に保存し、チャットには送信しません。\n\n'
read -r -p '進める場合はEnter、中止する場合はCtrl+Cを押してください: ' answer
setup_root="${HOME}/Library/Application Support/WUTO-WURK-Cashbook"
mkdir -p "$setup_root/runtime"
chmod 700 "$setup_root" "$setup_root/runtime"
case "$(uname -m)" in arm64) setup_arch=arm64;; x86_64) setup_arch=x64;; *) printf 'このMacの種類に対応していません。\n'; exit 1;; esac
setup_node=''
for candidate in "$setup_root"/runtime/node-v24.*-darwin-"$setup_arch"/bin/node; do
 if [ -x "$candidate" ]; then setup_node="$candidate"; fi
done
if [ -z "$setup_node" ]; then
 printf '\n公式Node.jsを、このアプリ専用フォルダに準備します。管理者パスワードは不要です。\n'
 setup_tmp="$(mktemp -d "$setup_root/.runtime.XXXXXX")"
 curl --proto '=https' --tlsv1.2 -fsSL --max-time 60 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -o "$setup_tmp/checksums"
 setup_line="$(awk -v suffix="-darwin-$setup_arch.tar.gz" 'substr($2,length($2)-length(suffix)+1)==suffix {print $1, $2; exit}' "$setup_tmp/checksums")"
 setup_hash="${setup_line%% *}"
 setup_file="${setup_line#* }"
 if ! printf '%s' "$setup_hash" | /usr/bin/grep -Eq '^[0-9a-f]{64}$' || ! printf '%s' "$setup_file" | /usr/bin/grep -Eq '^node-v24\.[0-9]+\.[0-9]+-darwin-(arm64|x64)\.tar\.gz$'; then printf '公式ファイルの情報を確認できません。停止しました。\n'; exit 1; fi
 setup_version="${setup_file#node-}"; setup_version="${setup_version%%-darwin-*}"
 curl --proto '=https' --tlsv1.2 -fsSL --max-time 180 "https://nodejs.org/dist/$setup_version/$setup_file" -o "$setup_tmp/$setup_file"
 setup_actual="$(shasum -a 256 "$setup_tmp/$setup_file" | awk '{print $1}')"
 if [ "$setup_actual" != "$setup_hash" ]; then printf '公式チェックサムが一致しません。停止しました。\n'; exit 1; fi
 tar -xzf "$setup_tmp/$setup_file" -C "$setup_root/runtime"
 setup_node="$setup_root/runtime/${setup_file%.tar.gz}/bin/node"
fi
export PATH="$(dirname "$setup_node"):$PATH"
set +e
"$setup_node" ./setup.mjs
setup_status=$?
set -e
printf '\nこの画面は閉じてもかまいません。\n'
read -r -p 'Enterで終了します: ' answer
exit "$setup_status"
