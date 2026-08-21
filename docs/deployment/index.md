---
title: Deployment
description: Deploy OpenEidon in production environments
---

# Deployment

OpenEidon supports multiple deployment strategies for different environments
and scales.

## Docker

The recommended way to deploy OpenEidon in production. Multi-stage builds
with CPU and GPU (NVIDIA CUDA, AMD ROCm) variants.

[:octicons-arrow-right-24: Docker deployment](docker.md)

## systemd (Linux)

Run OpenEidon as a managed system service on Linux servers.

[:octicons-arrow-right-24: systemd setup](systemd.md)

## launchd (macOS)

Register OpenEidon as a launch agent on macOS.

[:octicons-arrow-right-24: launchd setup](launchd.md)

## API Server

Run OpenEidon as an OpenAI-compatible HTTP server via `eidon serve`.

[:octicons-arrow-right-24: API server guide](api-server.md)
