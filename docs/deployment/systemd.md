# systemd Service (Linux)

OpenEidon includes a systemd unit file for running the API server as a managed background service on Linux. This provides automatic startup on boot, crash recovery, and integration with standard Linux service management tools.

## Prerequisites

Before installing the service, ensure that:

1. OpenEidon is installed in a virtual environment at `/opt/openeidon/.venv` (or adjust paths accordingly).
2. A dedicated `openeidon` system user exists (recommended for security).
3. An inference engine (such as Ollama) is running and accessible.

Create the user and installation directory:

```bash
sudo useradd --system --create-home --home-dir /opt/openeidon openeidon
sudo -u openeidon python3 -m venv /opt/openeidon/.venv
sudo -u openeidon git clone https://github.com/Yelt-sk/OpenEidon.git /opt/openeidon/OpenEidon
cd /opt/openeidon/OpenEidon && sudo -u openeidon uv sync --extra server
```

## Installing the Service

Copy the unit file to the systemd directory, reload the daemon, and enable the service:

```bash
sudo cp deploy/systemd/openeidon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable openeidon
sudo systemctl start openeidon
```

Verify it is running:

```bash
sudo systemctl status openeidon
```

## Service File Reference

The provided unit file at `deploy/systemd/openeidon.service`:

```ini
[Unit]
Description=OpenEidon API Server
After=network.target

[Service]
Type=simple
User=openeidon
WorkingDirectory=/opt/openeidon
ExecStart=/opt/openeidon/.venv/bin/eidon serve --host 0.0.0.0 --port 8000
Restart=on-failure
RestartSec=5
Environment=HOME=/opt/openeidon

[Install]
WantedBy=multi-user.target
```

### `[Unit]` Section

| Directive     | Value              | Description                                                                 |
|---------------|--------------------|-----------------------------------------------------------------------------|
| `Description` | `OpenEidon API Server` | Human-readable name shown in `systemctl status` and logs.              |
| `After`       | `network.target`   | Delays startup until the network stack is available, since the server binds to a network socket and may need to reach a remote engine. |

### `[Service]` Section

| Directive          | Value                                                              | Description                                                                                     |
|--------------------|--------------------------------------------------------------------|-------------------------------------------------------------------------------------------------|
| `Type`             | `simple`                                                           | The process started by `ExecStart` is the main service process. systemd considers the service started immediately. |
| `User`             | `openeidon`                                                       | Runs the server as the `openeidon` user rather than root, limiting the blast radius of any security issue. |
| `WorkingDirectory` | `/opt/openeidon`                                                  | Sets the working directory for the process. This is where OpenEidon looks for local files and writes data. |
| `ExecStart`        | `/opt/openeidon/.venv/bin/eidon serve --host 0.0.0.0 --port 8000` | The command to start the server. Uses the full path to the `eidon` binary inside the virtual environment. |
| `Restart`          | `on-failure`                                                       | Automatically restarts the service if it exits with a non-zero exit code. Does not restart on clean shutdown (`systemctl stop`). |
| `RestartSec`       | `5`                                                                | Waits 5 seconds before attempting a restart, preventing rapid restart loops if the service crashes immediately on startup. |
| `Environment`      | `HOME=/opt/openeidon`                                             | Sets the `HOME` environment variable so OpenEidon finds its configuration at `~/.openeidon/config.toml` (resolving to `/opt/openeidon/.openeidon/config.toml`). |

### `[Install]` Section

| Directive    | Value               | Description                                                                                 |
|--------------|---------------------|---------------------------------------------------------------------------------------------|
| `WantedBy`   | `multi-user.target` | The service starts when the system reaches multi-user mode (standard boot target for servers). `systemctl enable` creates a symlink under this target. |

## Configuration Options

### Changing the Bind Address and Port

Edit the `ExecStart` line to change the host or port:

```ini
ExecStart=/opt/openeidon/.venv/bin/eidon serve --host 127.0.0.1 --port 9000
```

!!! tip
    Binding to `127.0.0.1` restricts access to localhost only. Use this when running behind a reverse proxy like Nginx or Caddy.

### Setting the Engine and Model

Pass additional flags to `eidon serve`:

```ini
ExecStart=/opt/openeidon/.venv/bin/eidon serve --host 0.0.0.0 --port 8000 --engine ollama --model qwen3:8b
```

### Adding Environment Variables

Add multiple `Environment` directives or use `EnvironmentFile` for complex configurations:

```ini
[Service]
Environment=HOME=/opt/openeidon
Environment=OPENEIDON_ENGINE_DEFAULT=vllm
Environment=OPENEIDON_OLLAMA_HOST=http://localhost:11434
```

Or load from a file:

```ini
[Service]
EnvironmentFile=/opt/openeidon/.env
```

### Changing the User

If you prefer a different service user, update both the `User` directive and the paths:

```ini
[Service]
User=myuser
WorkingDirectory=/home/myuser/openeidon
ExecStart=/home/myuser/openeidon/.venv/bin/eidon serve --host 0.0.0.0 --port 8000
Environment=HOME=/home/myuser/openeidon
```

### Using a Configuration File

Ensure the configuration file exists at the path where `HOME` points:

```bash
sudo -u openeidon mkdir -p /opt/openeidon/.openeidon
sudo -u openeidon cp config.toml /opt/openeidon/.openeidon/config.toml
```

The server reads `~/.openeidon/config.toml` on startup, where `~` resolves from the `HOME` environment variable.

## Viewing Logs

OpenEidon logs are captured by journald. View them with `journalctl`:

```bash
# View all logs for the service
sudo journalctl -u openeidon

# Follow logs in real time
sudo journalctl -u openeidon -f

# View logs since the last boot
sudo journalctl -u openeidon -b

# View logs from the last hour
sudo journalctl -u openeidon --since "1 hour ago"

# View only error-level messages
sudo journalctl -u openeidon -p err
```

## Managing the Service

### Start, Stop, and Restart

```bash
# Start the service
sudo systemctl start openeidon

# Stop the service
sudo systemctl stop openeidon

# Restart the service (stop + start)
sudo systemctl restart openeidon

# Reload configuration without full restart (sends SIGHUP)
sudo systemctl reload-or-restart openeidon
```

### Check Status

```bash
sudo systemctl status openeidon
```

Example output:

```
● openeidon.service - OpenEidon API Server
     Loaded: loaded (/etc/systemd/system/openeidon.service; enabled; preset: enabled)
     Active: active (running) since Fri 2026-02-21 10:00:00 UTC; 2h ago
   Main PID: 12345 (eidon)
      Tasks: 4 (limit: 4915)
     Memory: 256.0M
        CPU: 1min 23s
     CGroup: /system.slice/openeidon.service
             └─12345 /opt/openeidon/.venv/bin/python /opt/openeidon/.venv/bin/eidon serve --host 0.0.0.0 --port 8000
```

### Enable and Disable on Boot

```bash
# Enable automatic start on boot
sudo systemctl enable openeidon

# Disable automatic start on boot
sudo systemctl disable openeidon
```

### Apply Changes After Editing the Unit File

After modifying `/etc/systemd/system/openeidon.service`, reload the systemd daemon and restart the service:

```bash
sudo systemctl daemon-reload
sudo systemctl restart openeidon
```

## Running Alongside Ollama

If Ollama is also managed via systemd, you can add an ordering dependency so the OpenEidon service waits for Ollama to start:

```ini
[Unit]
Description=OpenEidon API Server
After=network.target ollama.service
Requires=ollama.service
```

| Directive  | Description                                                              |
|------------|--------------------------------------------------------------------------|
| `After`    | Ensures OpenEidon starts after Ollama.                                  |
| `Requires` | If Ollama fails to start, OpenEidon will not start either.              |

!!! note
    Use `Wants` instead of `Requires` if you want OpenEidon to start even when Ollama is unavailable (for example, if you plan to start Ollama manually later).
