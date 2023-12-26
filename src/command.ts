import path from "path";
import fs from "fs";
import os from 'os';
import unWindows from './unWindows';

interface IAction {
  description: string;
  action: (...args: any[]) => any;
  alias?: string;
}

interface ICommands {
  init: IAction;
  examples: IAction;
  help: IAction;
  version: IAction;
}

const subCommands: ICommands = {
  init: {
    description: 'initialize jasmine',
    action: initJasmine
  },
  examples: {
    description: 'install examples',
    action: installExamples
  },
  help: {
    description: 'show help',
    action: help,
    alias: '-h'
  },
  version: {
    description: 'show jasmine and jasmine-core versions',
    action: version,
    alias: '-v'
  }
}

interface IDeps {
  print: (...args: any[]) => void;
  platform: () => NodeJS.Platform;
  Jasmine: any;
  ParallelRunner: any
}

export default class Command {
  private readonly projectBaseDir: string;
  private readonly specDir: string
  private readonly isWindows: boolean
  constructor(projectBaseDir: string, private examplesDir: string, private deps: IDeps) {
    const {platform} = deps;
    this.isWindows = platform() === "win32";

    this.projectBaseDir = this.isWindows ? unWindows(projectBaseDir) : projectBaseDir;
    this.specDir = `${this.projectBaseDir}/spec`
  }

  public async run(args: any[]) {
    setEnvironmentVariables(args);

    let commandToRun: IAction | undefined;
    Object.keys(subCommands).forEach((cmd) => {
      // @ts-ignore
      const commandObject = subCommands[cmd];
      if (args.indexOf(cmd) >= 0) {
        commandToRun = commandObject;
      } else if (commandObject.alias && args.indexOf(commandObject.alias) >= 0) {
        commandToRun = commandObject;
      }
    });

    if (commandToRun) {
      commandToRun.action({
        Jasmine: this.deps.Jasmine,
        projectBaseDir: this.projectBaseDir,
        specDir: this.specDir,
        examplesDir: this.examplesDir,
        print: this.deps.print
      });
    } else {
      const options = parseOptions(args, this.isWindows);
      if (options.usageErrors.length > 0) {
        process.exitCode = 1;

        for (const e of options.usageErrors) {
          this.deps.print(e);
        }

        this.deps.print('');
        help({print: this.deps.print});
      } else {
        await runJasmine(this.deps.Jasmine, this.deps.ParallelRunner, this.projectBaseDir, options);
      }
    }
  }
}

function isFileArg(arg: any): boolean {
  return arg.indexOf('--') !== 0 && !isEnvironmentVariable(arg);
}

function parseOptions(argv: any, isWindows: boolean) {
  // tslint:disable-next-line:one-variable-per-declaration
  let color = process.stdout.isTTY || false,
    reporter,
    configPath,
    filter,
    failFast,
    random,
    seed,
    numWorkers = 1;

  // tslint:disable-next-line:one-variable-per-declaration
  const files = [],
    helpers = [],
    requires = [],
    unknownOptions = [],
    usageErrors = []

    for (const arg in argv) {
    if (arg === '--no-color') {
      color = false;
    } else if (arg === '--color') {
      color = true;
    } else if (arg.match("^--filter=")) {
      // @ts-ignore
      filter = arg.match("^--filter=(.*)")[1];
    } else if (arg.match("^--helper=")) {
      // @ts-ignore
      helpers.push(arg.match("^--helper=(.*)")[1]);
    } else if (arg.match("^--require=")) {
      // @ts-ignore
      requires.push(arg.match("^--require=(.*)")[1]);
    } else if (arg === '--fail-fast') {
      failFast = true;
    } else if (arg.match("^--random=")) {
      // @ts-ignore
      random = arg.match("^--random=(.*)")[1] === 'true';
    } else if (arg.match("^--seed=")) {
      // @ts-ignore
      seed = arg.match("^--seed=(.*)")[1];
    } else if (arg.match("^--config=")) {
      // @ts-ignore
      configPath = arg.match("^--config=(.*)")[1];
    } else if (arg.match("^--reporter=")) {
      // @ts-ignore
      reporter = arg.match("^--reporter=(.*)")[1];
    } else if (arg.match("^--parallel=(.*)")) {
      // @ts-ignore
      const w = arg.match("^--parallel=(.*)")[1];
      if (w === 'auto') {
        // A reasonable default in most situations
        numWorkers = os.cpus().length -1;
      } else {
        numWorkers = parseFloat(w);
        if (isNaN(numWorkers) || numWorkers < 2 || numWorkers !== Math.floor(numWorkers)) {
          usageErrors.push('Argument to --parallel= must be an integer greater than 1');
        }
      }
    } else if (arg === '--') {
      break;
    } else if (isFileArg(arg)) {
      files.push(isWindows ? unWindows(arg) : arg);
    } else if (!isEnvironmentVariable(arg)) {
      unknownOptions.push(arg);
    }
  }

  if (unknownOptions.length > 0) {
    usageErrors.push('Unknown options: ' + unknownOptions.join(', '));
  }

  return {
    color,
    configPath,
    filter,
    failFast,
    helpers,
    requires,
    reporter,
    files,
    random,
    seed,
    numWorkers,
    usageErrors
  };
}

async function runJasmine(Jasmine: any, ParallelRunner: any, projectBaseDir: string, options: any) {
  let runner;

  if (options.numWorkers > 1) {
    runner = new ParallelRunner({
      projectBaseDir,
      numWorkers: options.numWorkers
    });
  } else {
    runner = new Jasmine({
      projectBaseDir
    });
  }

  await runner.loadConfigFile(options.configPath || process.env.JASMINE_CONFIG_PATH);

  if (options.failFast !== undefined) {
    runner.configureEnv({
      stopSpecOnExpectationFailure: options.failFast,
      stopOnSpecFailure: options.failFast
    });
  }

  if (options.seed !== undefined) {
    runner.seed(options.seed);
  }

  if (options.random !== undefined) {
    runner.randomizeTests(options.random);
  }

  if (options.helpers !== undefined && options.helpers.length) {
    runner.addMatchingHelperFiles(options.helpers);
  }

  if (options.requires !== undefined && options.requires.length) {
    runner.addRequires(options.requires);
  }

  if (options.reporter !== undefined) {
    await registerReporter(options.reporter, runner);
  }

  runner.showColors(options.color);

  try {
    await runner.execute(options.files, options.filter);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
}

async function registerReporter(reporterModuleName: string, runner: any) {
  let Reporter;

  try {
    Reporter = await runner.loader.load(resolveReporter(reporterModuleName));
  } catch (e) {
    throw new Error('Failed to load reporter module '+ reporterModuleName +
    // @ts-ignore
      '\nUnderlying error: ' + e.stack + '\n(end underlying error)');
  }

  let reporter;

  try {
    reporter = new Reporter();
  } catch (e) {
    throw new Error('Failed to instantiate reporter from '+ reporterModuleName +
    // @ts-ignore
      '\nUnderlying error: ' + e.stack + '\n(end underlying error)');
  }

  runner.clearReporters();
  runner.addReporter(reporter);
}

function resolveReporter(nameOrPath: string) {
  if (nameOrPath.startsWith('./') || nameOrPath.startsWith('../')) {
    return path.resolve(nameOrPath);
  } else {
    return nameOrPath;
  }
}

function initJasmine(options: any) {
  const print = options.print;
  const specDir = options.specDir;
  makeDirStructure(path.join(specDir, 'support/'));
  if (!fs.existsSync(path.join(specDir, 'support/jasmine.json'))) {
    fs.writeFileSync(path.join(specDir, 'support/jasmine.json'), fs.readFileSync(path.join(__dirname, './examples/jasmine.json'), 'utf-8'));
  } else {
    print('spec/support/jasmine.json already exists in your project.');
  }
}

function installExamples(options: any) {
  const specDir = options.specDir;
  const projectBaseDir = options.projectBaseDir;
  const examplesDir = options.examplesDir;

  makeDirStructure(path.join(specDir, 'support'));
  makeDirStructure(path.join(specDir, 'jasmine_examples'));
  makeDirStructure(path.join(specDir, 'helpers', 'jasmine_examples'));
  makeDirStructure(path.join(projectBaseDir, 'lib', 'jasmine_examples'));

  copyFiles(
    path.join(examplesDir, 'spec', 'helpers', 'jasmine_examples'),
    path.join(specDir, 'helpers', 'jasmine_examples'),
    new RegExp(/[Hh]elper\.js/)
  );

  copyFiles(
    path.join(examplesDir, 'lib', 'jasmine_examples'),
    path.join(projectBaseDir, 'lib', 'jasmine_examples'),
    new RegExp(/\.js/)
  );

  copyFiles(
    path.join(examplesDir, 'spec', 'jasmine_examples'),
    path.join(specDir, 'jasmine_examples'),
    new RegExp(/[Ss]pec.js/)
  );
}

function help(options: any) {
  const print = options.print;
  print('Usage: jasmine [command] [options] [files] [--]');
  print('');
  print('Commands:');
  Object.keys(subCommands).forEach((cmd) => {
    let commandNameText = cmd;
    // @ts-ignore
    if(subCommands[cmd].alias) {
    // @ts-ignore
      commandNameText = commandNameText + ',' + subCommands[cmd].alias;
    }
    // @ts-ignore
    print('%s\t%s', lPad(commandNameText, 10), subCommands[cmd].description);
  });
  print('');
  print('If no command is given, jasmine specs will be run');
  print('');
  print('');

  print('Options:');
  print('%s\tRun in parallel with N workers', lPad('--parallel=N', 18));
  print('%s\tRun in parallel with an automatically chosen number of workers', lPad('--parallel=auto', 18));
  print('%s\tturn off color in spec output', lPad('--no-color', 18));
  print('%s\tforce turn on color in spec output', lPad('--color', 18));
  print('%s\tfilter specs to run only those that match the given string', lPad('--filter=', 18));
  print('%s\tload helper files that match the given string', lPad('--helper=', 18));
  print('%s\tload module that match the given string', lPad('--require=', 18));
  print('%s\tstop Jasmine execution on spec failure', lPad('--fail-fast', 18));
  print('%s\tpath to your optional jasmine.json', lPad('--config=', 18));
  print('%s\tpath to reporter to use instead of the default Jasmine reporter', lPad('--reporter=', 18));
  print('%s\tmarker to signal the end of options meant for Jasmine', lPad('--', 18));
  print('');
  print('The given arguments take precedence over options in your jasmine.json');
  print('The path to your optional jasmine.json can also be configured by setting the JASMINE_CONFIG_PATH environment variable');
}

function version(options: any) {
  const print = options.print;
  print('jasmine-ts v' + require('../package.json').version);
}

function lPad(str: string, len: number) {
  if (str.length >= len) {
    return str;
  } else {
    return lPad(' ' + str, len);
  }
}

function copyFiles(srcDir: string, destDir: string, pattern: any) {
  const srcDirFiles = fs.readdirSync(srcDir);
  srcDirFiles.forEach((file) => {
    if (file.search(pattern) !== -1) {
      fs.writeFileSync(path.join(destDir, file), fs.readFileSync(path.join(srcDir, file)));
    }
  });
}

function makeDirStructure(absolutePath: string) {
  const splitPath = absolutePath.split(path.sep);
  splitPath.forEach((dir, index) => {
    if (index > 1) {
      const fullPath = path.join(splitPath.slice(0, index).join('/'), dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath);
      }
    }
  });
}

function isEnvironmentVariable(arg: string) {
  if (arg.match(/^--/)) {
    return false;
  }

  return arg.match(/(.*)=(.*)/);
}

function setEnvironmentVariables(args: string[]) {
  args.forEach((arg) => {
    const regexpMatch = isEnvironmentVariable(arg);
    if (regexpMatch) {
      const key = regexpMatch[1];
      process.env[key] = regexpMatch[2];
    }
  })
}
