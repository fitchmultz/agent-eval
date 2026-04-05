.PHONY: bootstrap update format fix lint typecheck test build benchmark scan-public smoke-dist ci release-check clean

bootstrap:
	pnpm install

update:
	pnpm update --latest

format:
	pnpm format

fix: format

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

build:
	pnpm build

benchmark:
	pnpm benchmark

scan-public: benchmark
	pnpm scan:artifacts artifacts/benchmark

smoke-dist: build
	pnpm smoke:dist

ci: lint typecheck test benchmark scan-public smoke-dist

release-check:
	pnpm check:release

clean:
	rm -rf dist node_modules coverage
