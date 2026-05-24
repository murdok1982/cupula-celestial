# Nix flake — Cúpula Celestial orquestador (FASE 2).
#
# Esqueleto inicial. La build completa de los binarios Rust requiere
# `crane` o `naersk` + handling cuidadoso de `rdkafka` (cmake + librdkafka).
# Mantener este archivo como reference para developers que ya tienen Nix.

{
  description = "Cupula Celestial Orquestador — reproducible builds";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-24.05";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = { self, nixpkgs, flake-utils, rust-overlay }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs { inherit system overlays; };
        rustToolchain = pkgs.rust-bin.stable.latest.default;
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            rustToolchain
            pkg-config
            openssl
            cmake
            zlib
            librdkafka
            postgresql
            sqlx-cli
            cargo-audit
            cargo-deny
            cargo-cyclonedx
            opa
            python312
            python312Packages.pip
          ];

          shellHook = ''
            echo "Cupula Celestial dev shell — Rust: $(rustc --version)"
            export RUST_BACKTRACE=1
            export SOURCE_DATE_EPOCH=$(git log -1 --format=%ct 2>/dev/null || echo 0)
          '';
        };

        # Placeholders para futuras builds completas:
        # packages.hmi-gateway = pkgs.callPackage ./services/hmi-gateway/default.nix {};
        # packages.audit-log = pkgs.callPackage ./services/audit-log/default.nix {};
      });
}
