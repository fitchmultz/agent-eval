install:
	pnpm install

update:
	pnpm update --latest

format:
	pnpm format

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

build:
	pnpm build

ci: install format lint typecheck build test

clean:
	rm -rf dist node_modules
