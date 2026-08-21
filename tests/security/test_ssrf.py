"""Tests for SSRF protection module."""

from __future__ import annotations

from unittest.mock import patch

from openjarvis.security.ssrf import _check_ssrf_python, check_ssrf, is_private_ip


class TestIsPrivateIp:
    def test_private_10_network(self):
        assert is_private_ip("10.0.0.1") is True
        assert is_private_ip("10.255.255.255") is True

    def test_private_172_16_network(self):
        assert is_private_ip("172.16.0.1") is True
        assert is_private_ip("172.31.255.255") is True

    def test_private_192_168_network(self):
        assert is_private_ip("192.168.0.1") is True
        assert is_private_ip("192.168.1.100") is True

    def test_loopback(self):
        assert is_private_ip("127.0.0.1") is True
        assert is_private_ip("127.255.255.255") is True

    def test_ipv6_loopback(self):
        assert is_private_ip("::1") is True

    def test_link_local(self):
        assert is_private_ip("169.254.0.1") is True

    def test_public_ips(self):
        assert is_private_ip("8.8.8.8") is False
        assert is_private_ip("1.1.1.1") is False
        assert is_private_ip("93.184.216.34") is False

    def test_invalid_ip(self):
        assert is_private_ip("not-an-ip") is False

    def test_empty_string(self):
        assert is_private_ip("") is False


class TestCheckSsrf:
    """Tests for SSRF protection.

    The Rust backend performs real DNS resolution, so tests that need to
    mock DNS use ``_check_ssrf_python`` (the pure-Python implementation)
    instead of the Rust-backed ``check_ssrf``.
    """

    def test_blocks_aws_metadata(self):
        result = check_ssrf("http://169.254.169.254/latest/meta-data/")
        assert result is not None
        assert "cloud metadata" in result.lower() or "Blocked host" in result

    def test_blocks_google_metadata(self):
        result = check_ssrf("http://metadata.google.internal/computeMetadata/v1/")
        assert result is not None
        assert "Blocked host" in result

    def test_blocks_alibaba_metadata(self):
        result = check_ssrf("http://100.100.100.200/latest/meta-data/")
        assert result is not None
        assert "Blocked host" in result

    def test_allows_normal_urls(self):
        # Use Python impl so we can mock DNS resolution
        with patch("openjarvis.security.ssrf.socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [
                (2, 1, 6, "", ("93.184.216.34", 0)),
            ]
            result = _check_ssrf_python("https://example.com")
        assert result is None

    def test_blocks_localhost_url(self):
        with patch("openjarvis.security.ssrf.socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [
                (2, 1, 6, "", ("127.0.0.1", 0)),
            ]
            result = _check_ssrf_python("http://localhost:8080/admin")
        assert result is not None
        assert "private IP" in result

    def test_blocks_private_ip_url(self):
        with patch("openjarvis.security.ssrf.socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [
                (2, 1, 6, "", ("192.168.1.1", 0)),
            ]
            result = _check_ssrf_python("http://internal-service.local/api")
        assert result is not None
        assert "private IP" in result

    def test_no_hostname(self):
        # Rust returns "Invalid URL" for malformed URLs (no scheme => parse error)
        result = check_ssrf("not-a-url")
        assert result is not None
        assert "Invalid URL" in result

    def test_dns_failure_allowed(self):
        """DNS resolution failure should not block — request will fail at HTTP time."""
        import socket

        with patch(
            "openjarvis.security.ssrf.socket.getaddrinfo",
            side_effect=socket.gaierror("Name resolution failed"),
        ):
            result = _check_ssrf_python("https://nonexistent.example.com")
        assert result is None

    def test_blocks_dns_rebinding_to_private(self):
        """Even if hostname looks normal, block if it resolves to private IP."""
        with patch("openjarvis.security.ssrf.socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = [
                (2, 1, 6, "", ("10.0.0.5", 0)),
            ]
            result = _check_ssrf_python("https://evil-rebind.example.com")
        assert result is not None
        assert "private IP" in result


__all__ = ["TestCheckSsrf", "TestIsPrivateIp"]
