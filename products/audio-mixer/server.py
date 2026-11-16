# -*- coding: utf-8 -*-
"""
抖音混音台 —— 本地人声处理服务
纯 Python 标准库 + ffmpeg，无需安装任何第三方包。
"""

import http.server
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.parse
import uuid
import webbrowser

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding='utf-8')
    except Exception:
        pass

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, 'web')
WORK_DIR = os.path.join(BASE_DIR, 'workspace')
UP_DIR = os.path.join(WORK_DIR, 'uploads')
OUT_DIR = os.path.join(WORK_DIR, 'outputs')
for _d in (WEB_DIR, WORK_DIR, UP_DIR, OUT_DIR):
    os.makedirs(_d, exist_ok=True)

PORT = int(os.environ.get('MIXER_PORT', '8787'))
MAX_UPLOAD = 400 * 1024 * 1024

AUDIO_EXT = {'.wav', '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wma', '.aiff', '.aif', '.amr'}
VIDEO_EXT = {'.mp4', '.mov', '.mkv', '.avi', '.m4v', '.webm'}
ALLOWED_IN = AUDIO_EXT | VIDEO_EXT

MIME = {
    '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
    '.aac': 'audio/aac', '.flac': 'audio/flac', '.ogg': 'audio/ogg',
    '.opus': 'audio/opus', '.wma': 'audio/x-ms-wma', '.aiff': 'audio/aiff',
    '.aif': 'audio/aiff', '.amr': 'audio/amr', '.mp4': 'video/mp4',
    '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
    '.avi': 'video/x-msvideo', '.m4v': 'video/x-m4v', '.webm': 'video/webm',
    '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
}


# ------------------------------------------------------------------ ffmpeg 定位
def _candidates(name):
    exe = name + ('.exe' if os.name == 'nt' else '')
    out = []
    if name == 'ffmpeg':
        env = os.environ.get('FFMPEG_PATH')
        if env:
            out.append(env)
    w = shutil.which(name)
    if w:
        out.append(w)
    for root in (r'C:\ffmpeg\bin', r'C:\Program Files\ffmpeg\bin',
                 r'C:\Program Files (x86)\ffmpeg\bin',
                 os.path.join(BASE_DIR, 'ffmpeg', 'bin')):
        out.append(os.path.join(root, exe))
    return out


def find_tool(name):
    for c in _candidates(name):
        if c and os.path.isfile(c):
            return c
    return None


FFMPEG = find_tool('ffmpeg')
FFPROBE = find_tool('ffprobe')


def run(cmd, timeout=3600):
    return subprocess.run(cmd, capture_output=True, text=True,
                          encoding='utf-8', errors='replace', timeout=timeout)


def probe(path):
    """读取音频元信息"""
    if not FFPROBE:
        return {}
    try:
        r = run([FFPROBE, '-v', 'quiet', '-print_format', 'json',
                 '-show_format', '-show_streams', path], timeout=120)
        data = json.loads(r.stdout or '{}')
    except Exception:
        return {}
    fmt = data.get('format', {}) or {}
    out = {}
    try:
        out['duration'] = round(float(fmt.get('duration')), 2)
    except Exception:
        out['duration'] = None
    for st in data.get('streams', []) or []:
        if st.get('codec_type') == 'audio':
            out['codec'] = st.get('codec_name')
            out['sample_rate'] = st.get('sample_rate')
            out['channels'] = st.get('channels')
            break
    return out


# ------------------------------------------------------------------ 处理链
# afftdn: nr=降噪量(dB)  nf=噪声底噪(dB)  tn=动态跟踪噪声
DENOISE = {
    'off':    None,
    'light':  'afftdn=nr=8:nf=-40:tn=1',
    'medium': 'afftdn=nr=15:nf=-30:tn=1',
    'strong': 'afftdn=nr=25:nf=-22:tn=1',
}


def build_chain(o):
    parts = []
    if o.get('highpass'):
        parts.append('highpass=f=75')
    d = DENOISE.get(o.get('denoise', 'medium'))
    if d:
        parts.append(d)
    if o.get('deesser'):
        parts.append('deesser=i=0.35:m=0.5:f=0.5')
    if o.get('compress'):
        parts.append('acompressor=threshold=-20dB:ratio=3:attack=8:release=180:makeup=1')
    return ','.join(parts)


def measure(path, chain, lufs, tp, lra):
    """第一遍：测量响度（EBU R128）"""
    f = ','.join(x for x in [chain, f'loudnorm=I={lufs}:TP={tp}:LRA={lra}:print_format=json'] if x)
    cmd = [FFMPEG, '-hide_banner', '-nostats', '-i', path, '-map', '0:a:0',
           '-af', f, '-f', 'null', os.devnull, '-y']
    r = run(cmd)
    blocks = re.findall(r'\{[^{}]*"input_i"[^{}]*\}', r.stderr or '', re.S)
    if not blocks:
        return None
    try:
        return json.loads(blocks[-1])
    except Exception:
        return None


# 视频容器 → 对应的音轨编码参数（视频流始终 copy，不动画面）
VIDEO_AENC = {
    '.mp4':  ['-c:a', 'aac', '-b:a', '256k'],
    '.m4v':  ['-c:a', 'aac', '-b:a', '256k'],
    '.mov':  ['-c:a', 'aac', '-b:a', '256k'],
    '.mkv':  ['-c:a', 'aac', '-b:a', '256k'],
    '.webm': ['-c:a', 'libopus', '-b:a', '192k'],
    '.avi':  ['-c:a', 'libmp3lame', '-b:a', '256k'],
}


def loudnorm_apply(chain, measured, lufs, tp, lra):
    """两遍 loudnorm 的第二遍：带着第一遍的测量结果做线性归一化"""
    ln = None
    if measured:
        try:
            ln = (f"loudnorm=I={lufs}:TP={tp}:LRA={lra}"
                  f":measured_I={measured['input_i']}:measured_TP={measured['input_tp']}"
                  f":measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}"
                  f":offset={measured['target_offset']}:linear=true")
        except KeyError:
            ln = None
    if not ln:
        ln = f"loudnorm=I={lufs}:TP={tp}:LRA={lra}"
    return ','.join(x for x in [chain, ln] if x)


def process(src, dst, opts, fmt):
    """音频进出：两遍 loudnorm（先测量再线性归一化）"""
    chain = build_chain(opts)
    m = measure(src, chain, opts['lufs'], opts['tp'], opts['lra'])
    af = loudnorm_apply(chain, m, opts['lufs'], opts['tp'], opts['lra'])

    enc = {
        'wav':  ['-c:a', 'pcm_s16le'],
        'mp3':  ['-c:a', 'libmp3lame', '-b:a', '320k'],
        'm4a':  ['-c:a', 'aac', '-b:a', '256k'],
        'flac': ['-c:a', 'flac'],
    }.get(fmt, ['-c:a', 'aac', '-b:a', '256k'])

    cmd = [FFMPEG, '-hide_banner', '-nostats', '-y', '-i', src,
           '-map', '0:a:0', '-vn', '-af', af,
           '-ar', '44100', '-ac', '2'] + enc + [dst]
    r = run(cmd)
    if not os.path.isfile(dst) or os.path.getsize(dst) == 0:
        raise RuntimeError('ffmpeg 处理失败：\n' + (r.stderr or '')[-900:])
    return m


def process_video(src, dst, opts, ext):
    """视频进出：画面 -c:v copy 原样封装，只重做音轨"""
    chain = build_chain(opts)
    m = measure(src, chain, opts['lufs'], opts['tp'], opts['lra'])
    af = loudnorm_apply(chain, m, opts['lufs'], opts['tp'], opts['lra'])

    aenc = VIDEO_AENC.get(ext, ['-c:a', 'aac', '-b:a', '256k'])
    cmd = [FFMPEG, '-hide_banner', '-nostats', '-y', '-i', src,
           '-map', '0:v:0', '-map', '0:a:0',
           '-c:v', 'copy',
           '-af', af, '-ar', '44100', '-ac', '2'] + aenc + ['-shortest', dst]
    r = run(cmd)
    if not os.path.isfile(dst) or os.path.getsize(dst) == 0:
        raise RuntimeError('ffmpeg 处理视频失败：\n' + (r.stderr or '')[-900:])
    return m


def cleanup_old(days=7):
    now = time.time()
    for d in (UP_DIR, OUT_DIR):
        try:
            for fn in os.listdir(d):
                fp = os.path.join(d, fn)
                if os.path.isfile(fp) and now - os.path.getmtime(fp) > days * 86400:
                    try:
                        os.remove(fp)
                    except Exception:
                        pass
        except Exception:
            pass


# ------------------------------------------------------------------ HTTP
class Handler(http.server.BaseHTTPRequestHandler):
    server_version = 'DouyinMixer/1.0'
    protocol_version = 'HTTP/1.1'

    def log_message(self, fmt, *args):
        pass

    # ---- 工具
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _serve(self, path, download_name=None):
        if not os.path.isfile(path):
            self.send_error(404, 'Not Found')
            return
        size = os.path.getsize(path)
        ctype = MIME.get(os.path.splitext(path)[1].lower(), 'application/octet-stream')

        start, end, code = 0, size - 1, 200
        rng = self.headers.get('Range')
        if rng:
            m = re.match(r'bytes=(\d*)-(\d*)', rng.strip())
            if m:
                if m.group(1):
                    start = int(m.group(1))
                if m.group(2):
                    end = int(m.group(2))
                end = min(end, size - 1)
                if start > end:
                    start = 0
                code = 206

        length = end - start + 1
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(length))
        if code == 206:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        if download_name:
            self.send_header(
                'Content-Disposition',
                "attachment; filename*=UTF-8''" + urllib.parse.quote(download_name))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

        try:
            with open(path, 'rb') as f:
                f.seek(start)
                left = length
                while left > 0:
                    chunk = f.read(min(262144, left))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    left -= len(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # ---- GET
    def do_GET(self):
        p = urllib.parse.urlparse(self.path)
        path, q = p.path, urllib.parse.parse_qs(p.query)

        if path in ('/', '/index.html'):
            return self._serve(os.path.join(WEB_DIR, 'index.html'))

        if path == '/api/health':
            return self._json({
                'ok': True,
                'ffmpeg': FFMPEG,
                'ffprobe': FFPROBE,
                'ready': bool(FFMPEG),
                'port': PORT,
            })

        if path.startswith('/media/up/'):
            fn = os.path.basename(path[len('/media/up/'):])
            return self._serve(os.path.join(UP_DIR, fn))

        if path.startswith('/media/out/'):
            fn = os.path.basename(path[len('/media/out/'):])
            dl = q.get('dl', ['0'])[0] == '1'
            name = q.get('name', [None])[0]
            return self._serve(os.path.join(OUT_DIR, fn),
                               urllib.parse.unquote(name) if (dl and name) else None)

        if path.startswith('/static/'):
            rel = path[len('/static/'):].lstrip('/')
            full = os.path.normpath(os.path.join(WEB_DIR, rel))
            if not full.startswith(WEB_DIR):
                self.send_error(403, 'Forbidden')
                return
            return self._serve(full)

        self.send_error(404, 'Not Found')

    # ---- POST
    def do_POST(self):
        p = urllib.parse.urlparse(self.path)
        if p.path != '/api/process':
            return self._json({'ok': False, 'error': '接口不存在'}, 404)

        try:
            q = urllib.parse.parse_qs(p.query)

            def g(k, d=None):
                v = q.get(k)
                return v[0] if v else d

            raw = urllib.parse.unquote(g('name', 'audio'))
            name = os.path.basename(raw) or 'audio'
            ext = os.path.splitext(name)[1].lower()

            if ext not in ALLOWED_IN:
                return self._json({'ok': False, 'error': f'不支持的格式：{ext or "未知"}'}, 400)

            length = int(self.headers.get('Content-Length') or 0)
            if length <= 0:
                return self._json({'ok': False, 'error': '文件是空的'}, 400)
            if length > MAX_UPLOAD:
                return self._json({'ok': False, 'error': '文件超过 400MB'}, 413)

            uid = uuid.uuid4().hex[:12]
            src = os.path.join(UP_DIR, uid + ext)
            remain = length
            with open(src, 'wb') as f:
                while remain > 0:
                    chunk = self.rfile.read(min(1 << 20, remain))
                    if not chunk:
                        break
                    f.write(chunk)
                    remain -= len(chunk)

            def fnum(key, default, lo, hi):
                try:
                    v = float(g(key, str(default)))
                except Exception:
                    return default
                return max(lo, min(hi, v))

            opts = {
                'denoise': g('denoise', 'medium'),
                'highpass': g('highpass', '1') == '1',
                'deesser': g('deesser', '0') == '1',
                'compress': g('compress', '0') == '1',
                'lufs': fnum('lufs', -14.0, -30.0, -6.0),
                'tp':   fnum('tp', -1.5, -6.0, 0.0),
                'lra':  fnum('lra', 11.0, 1.0, 20.0),
            }
            if opts['denoise'] not in DENOISE:
                opts['denoise'] = 'medium'

            is_video_in = ext in VIDEO_EXT
            outmode = g('outmode', 'video' if is_video_in else 'audio')
            if outmode not in ('video', 'audio') or not is_video_in:
                outmode = 'audio'

            if outmode == 'video':
                enc_fmt = ext.lstrip('.')
                out_ext = ext
            else:
                enc_fmt = g('format', 'm4a')
                if enc_fmt not in ('wav', 'mp3', 'm4a', 'flac'):
                    enc_fmt = 'm4a'
                out_ext = '.' + enc_fmt

            if outmode == 'video' and not probe(src).get('codec'):
                return self._json(
                    {'ok': False, 'error': '这个视频没有音轨，没法处理'}, 400)

            dst = os.path.join(OUT_DIR, f'{uid}{out_ext}')
            t0 = time.time()
            if outmode == 'video':
                measured = process_video(src, dst, opts, ext)
            else:
                measured = process(src, dst, opts, enc_fmt)
            cost = round(time.time() - t0, 1)

            info = probe(dst)
            base = os.path.splitext(name)[0]
            out_name = f'{base}_抖音版{out_ext}'

            return self._json({
                'ok': True,
                'id': uid,
                'is_video': outmode == 'video',
                'source': {'name': name, 'ext': ext, 'url': f'/media/up/{uid}{ext}'},
                'result': {
                    'name': out_name,
                    'fmt': enc_fmt,
                    'url': f'/media/out/{uid}{out_ext}',
                    'download': f'/media/out/{uid}{out_ext}?dl=1&name={urllib.parse.quote(out_name)}',
                    'size': os.path.getsize(dst),
                    'duration': info.get('duration'),
                    'sample_rate': info.get('sample_rate'),
                    'channels': info.get('channels'),
                },
                'measured': measured,
                'cost': cost,
            })
        except subprocess.TimeoutExpired:
            self._json({'ok': False, 'error': '处理超时（超过 1 小时）'}, 500)
        except Exception as e:
            self._json({'ok': False, 'error': str(e)}, 500)


class Server(http.server.ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def main():
    print('=' * 52)
    print('  抖音混音台')
    print('=' * 52)
    if not FFMPEG:
        print('  [警告] 没找到 ffmpeg，无法处理音频。')
        print('  请把 ffmpeg.exe 放到 C:\\ffmpeg\\bin\\ 或加入 PATH。')
    else:
        print(f'  ffmpeg : {FFMPEG}')
    cleanup_old(7)
    url = f'http://127.0.0.1:{PORT}'
    try:
        srv = Server(('127.0.0.1', PORT), Handler)
    except OSError as e:
        print(f'\n  [错误] 端口 {PORT} 被占用：{e}')
        print('  可能已经开着一个了，直接打开浏览器访问上面的地址即可。')
        input('\n  按回车退出...')
        return
    print(f'  地址   : {url}')
    print('  关闭此窗口即停止服务')
    print('=' * 52)
    print()
    if not os.environ.get('MIXER_NO_BROWSER'):
        try:
            webbrowser.open(url)
        except Exception:
            pass
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\n  已停止。')


if __name__ == '__main__':
    main()
