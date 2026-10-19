# Project conventions

- Every top-level function, class, interface, type, variable, and executable statement needs a one-sentence responsibility comment; imports do not need comments.
- Split code when its responsibility cannot be explained clearly in one sentence.
- Keep argument handling, provider calls, filesystem writes, and error mapping in their respective modules.
- Preserve the JSON stdout contract, stable error codes, and nonzero failure exit codes.
- Do not add automatic generation retries; they may cause duplicate charges.
- Use mocked HTTP responses in automated tests; real paid API calls require explicit user authorization.
- Run `pnpm check`, `pnpm test`, and `npm pack --dry-run` for release changes.
