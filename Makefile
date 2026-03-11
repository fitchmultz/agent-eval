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

ci: lint typecheck test benchmark build

clean:
	rm -rf dist node_modules coverage
