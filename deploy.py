import io
import os
import tarfile

import paramiko


BASE = os.path.dirname(os.path.abspath(__file__))


def required_env(name):
    value = os.environ.get(name)
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def filter_tar(tarinfo):
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


def main():
    server = required_env("FILESGO_SERVER")
    port = int(os.environ.get("FILESGO_SSH_PORT", "22"))
    user = required_env("FILESGO_SSH_USER")
    remote_dir = required_env("FILESGO_REMOTE_DIR")

    print("Creating deployment archive...")
    data = make_tar()
    print(f"Archive size: {len(data) / 1024 / 1024:.1f} MB")

    print(f"Connecting to {server}:{port}...")
    ssh = paramiko.SSHClient()
    ssh.load_system_host_keys()
    ssh.connect(
        server,
        port=port,
        username=user,
        look_for_keys=True,
        allow_agent=True,
    )

    try:
        sftp = ssh.open_sftp()

        print("Uploading archive...")
        remote_tar = f"{remote_dir}/deploy.tar.gz"
        sftp.putfo(io.BytesIO(data), remote_tar)
        sftp.close()

        print("Extracting and deploying on server...")
        commands = [
            f"cd {remote_dir} && tar xzf deploy.tar.gz && rm deploy.tar.gz",
            f"cd {remote_dir} && mkdir -p data/uploads",
            f"cp {remote_dir}/server-rust/config.yaml {remote_dir}/config.yaml",
            f"cd {remote_dir} && docker-compose build --no-cache 2>&1",
            f"cd {remote_dir} && docker-compose down 2>&1",
            f"cd {remote_dir} && docker-compose up -d 2>&1",
        ]

        for command in commands:
            print(f"Running: {command}")
            stdin, stdout, stderr = ssh.exec_command(command)
            exit_code = stdout.channel.recv_exit_status()
            out = stdout.read().decode()
            err = stderr.read().decode()
            if out:
                print(out)
            if err:
                print(f"STDERR: {err}")
            if exit_code != 0:
                print(f"Exit code: {exit_code}")
    finally:
        ssh.close()

    print("Deployment complete!")


if __name__ == "__main__":
    main()
