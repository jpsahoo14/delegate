# Runs a terminal program in a real pseudo-terminal (160x50) and answers its startup queries the way a terminal would,
# so the Copilot CLI's full-screen UI starts with no person at the keyboard. Input from stdin is forwarded. macOS and Linux.
# Usage: python3 scripts/pty-run.py <command> [args...]
import os, pty, select, sys, fcntl, termios, struct, signal

ANSWERS = [
    (b'\x1b[6n', b'\x1b[1;1R'),                       # cursor position
    (b'\x1b[c', b'\x1b[?62;22c'),                     # primary device attributes
    (b'\x1b[>c', b'\x1b[>0;0;0c'),                    # secondary device attributes
    (b'\x1b[?u', b'\x1b[?0u'),                        # keyboard protocol flags
    (b'\x1b]10;?', b'\x1b]10;rgb:d4d4/d4d4/d4d4\x1b\\'),  # foreground colour
    (b'\x1b]11;?', b'\x1b]11;rgb:1e1e/1e1e/1e1e\x1b\\'),  # background colour
]

pid, fd = pty.fork()
if pid == 0:
    os.execvp(sys.argv[1], sys.argv[1:])
fcntl.ioctl(fd, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 160, 0, 0))
os.kill(pid, signal.SIGWINCH)
stdin_open = True
tail = b''
while True:
    rl = [fd] + ([0] if stdin_open else [])
    try:
        r, _, _ = select.select(rl, [], [], 1.0)
    except InterruptedError:
        continue
    if fd in r:
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if not data:
            break
        os.write(1, data)
        buf = tail + data
        for q, a in ANSWERS:
            if q in buf:
                os.write(fd, a)
        for n in range(16):
            if b'\x1b]4;%d;?' % n in buf:
                os.write(fd, b'\x1b]4;%d;rgb:8080/8080/8080\x1b\\' % n)
        m = buf.find(b'$p')
        while m != -1:
            start = buf.rfind(b'\x1b[?', 0, m)
            if start != -1 and m - start < 12:
                mode = buf[start + 3:m]
                if mode.isdigit():
                    os.write(fd, b'\x1b[?' + mode + b';2$y')
            m = buf.find(b'$p', m + 2)
        tail = buf[-32:]
    if stdin_open and 0 in r:
        data = os.read(0, 4096)
        if not data:
            stdin_open = False
        else:
            os.write(fd, data)
    try:
        done, _ = os.waitpid(pid, os.WNOHANG)
        if done:
            break
    except ChildProcessError:
        break
