import paramiko
import os
import tarfile
import io
import time

SERVER = "103.69.128.25"
PORT = 22011
USER = "root"
PASSWORD = "Pa7kcBythDd5cWjK"
REMOTE_DIR = "/www/wwwroot/wotty/filesgo"

BASE = os.path.dirname(os.path.abspath(__file__))

def filter_tar(tarinfo):
    # Exclude Rust build artifacts (built inside Docker) and local data
    if "target" in tarinfo.name.split("/"):
        return None
    if "uploads" in tarinfo.name.split("/"):
        return None
    if tarinfo.name.endswith(".db"):
        return None
    return tarinfo

def make_tar():
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for name in ["Dockerfile", "docker-compose.yml", "server-rust"]:
            path = os.path.join(BASE, name)
            tar.add(path, arcname=name, filter=filter_tar)
    buf.seek(0)
    return buf.read()

print("Creating deployment archive...")
data = make_tar()
print(f"Archive size: {len(data) / 1024 / 1024:.1f} MB")

print(f"Connecting to {SERVER}:{PORT}...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(SERVER, port=PORT, username=USER, password=PASSWORD, look_for_keys=False, allow_agent=False)

sftp = ssh.open_sftp()

print("Uploading archive...")
remote_tar = f"{REMOTE_DIR}/deploy.tar.gz"
sftp.putfo(io.BytesIO(data), remote_tar)
sftp.close()

print("Extracting and deploying on server...")
commands = [
    f"cd {REMOTE_DIR} && tar xzf deploy.tar.gz && rm deploy.tar.gz",
    f"cd {REMOTE_DIR} && mkdir -p data/uploads",
    f"cp {REMOTE_DIR}/server-rust/config.yaml {REMOTE_DIR}/config.yaml",
    f"cd {REMOTE_DIR} && docker-compose build --no-cache 2>&1",
    f"cd {REMOTE_DIR} && docker-compose down 2>&1",
    f"cd {REMOTE_DIR} && docker-compose up -d 2>&1",
]

for cmd in commands:
    print(f"Running: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode()
    err = stderr.read().decode()
    if out:
        print(out)
    if err:
        print(f"STDERR: {err}")
    if exit_code != 0:
        print(f"Exit code: {exit_code}")

ssh.close()
print("Deployment complete!")
