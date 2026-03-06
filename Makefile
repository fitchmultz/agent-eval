install:
	pnpm install

update:
	pnpm update --latest

format:
	pnpm format

lint:
	pnpm lint

type-check:
	pnpm typecheck

test:
	pnpm test

build:
	pnpm build

ci: install format lint type-check build test

clean:
	rm -rf dist node_modules
