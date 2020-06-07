# Migrate Satire V

From Drupal to Directus

Dear god I can't believe I'm writing this

## Node

I've set it up so it's pretty simple to run either the main script or the test file (for random experiments), with normal node or debug node. The usage is:

```
npm [run] start <debug | run><test | main> [-- [<params>]
```

`run` and `main` are selected by default, so `npm start` is equivalent to `npm start runmain`.

You can also run `npm run build` to compile.

For the main script, the usage for command line can be accessed with `--help`, or don't enter anything and you can interactively set the command and options.

```
npm start -- --help
```
