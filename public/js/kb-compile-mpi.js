// Hand-written explanations for compiling, linking and MPI basics (ESC401 weeks 3-4).
// Same shape as kb-base.js, plus optional fields used by the richer Kitten Mode card:
//   ex (example code) · lines ([code, meaning] pairs for line-by-line reading) · steps · miss (common misunderstandings) · quiz
import { KB, GROUPS } from './kb-base.js';

GROUPS.D = 'Compiling and linking C programs';

const add = o => Object.assign(KB, o);

add({
  compiler: {
    e: '🛠️', name: 'compiler', g: 'D', pre: ['command'], re: /\bcompil(?:er|ers|e|es|ed|ing|ation)\b|\bgcc\b/i,
    why: 'A processor can only follow very low-level instructions made of numbers. People write programs in readable languages like C, so something has to translate one into the other.',
    simple: 'A program that translates your C source code into an executable file the computer can run.',
    kitten: "You write C in a text file such as `hello.c`. The computer can't run that text directly. The compiler reads it, checks it for mistakes and, if all is well, writes a new file: the executable. Compiling is not running; it only makes the program.",
    zero: 'Source code is text written for humans. A processor understands only numbers (machine code). A compiler is the translator between the two. You use it once: it reads `hello.c` and writes an executable called `hello`. After that you run `hello`, not `hello.c`.',
    cats: 'The compiler is the translator who turns a recipe written in human language into the exact button presses the automatic cat feeder understands.',
    technical: 'A compiler translates source code into machine code. With GCC, `gcc hello.c -o hello` runs four stages in one command (preprocessing, compilation to assembly, assembly into an object file, linking) and writes the executable `hello`. Syntax errors stop the build; warnings do not.',
    prof: 'The lecturer starts here because every later step (linking, MPI, job scripts) works with compiled programs.',
    next: 'how the compiled pieces are joined: linking.',
    ex: 'gcc hello.c -o hello\n./hello',
    steps: ['You write the source file hello.c.', 'You run the compiler: gcc hello.c -o hello.', 'The compiler checks the code and reports mistakes with a line number.', 'If there are no errors, it writes the executable hello.', 'You run the program with ./hello.'],
    miss: ["Compiling is not running. The compiler builds the program; it doesn't start it.", 'The .c file is not what runs. The executable is.', 'A warning is not an error: the program may still be built, but the warning is worth reading.'],
    quiz: { q: '`gcc hello.c -o hello` printed nothing and finished. What exists now?', code: '', opts: ['The program has run and printed its output', 'A new executable file called hello', 'Nothing: gcc only checks the code'], ans: 1, why: 'A successful compile is silent. It created the executable `hello`, which you start with `./hello`.' }
  },
  library: {
    e: '📚', name: 'library', g: 'D', pre: [], re: /\blibrar(?:y|ies)\b/i,
    why: "Nobody wants to rewrite printing or maths from scratch. A library is code written once and reused by everyone.",
    simple: 'A collection of ready-made functions you can use in your own programs.',
    kitten: "A library is a toolbox someone else built. You don't need to know how each tool is made, only how to ask for it, like `printf` or `sqrt`.",
    zero: 'A function is a named piece of code that does one job. A library is a bundle of such functions saved in a file. Your program says which ones it wants, and the linker fetches them.',
    cats: 'A library is a cupboard of ready-made cat toys: you take one, you do not build it.',
    technical: 'A library is a collection of compiled functions: static (`libname.a`) or shared (`libname.so`). The flag `-lname` links `libname`. The C standard library is linked automatically; the maths library (`libm`) and MPI often are not.',
    prof: 'Knowing what a library is makes flags like `-lm` make sense.',
    next: 'linking: how a library gets attached.',
    miss: ['Using a library has two parts: including its header in your code, and linking the library itself. Forgetting the second one gives `undefined reference`.']
  },
  linker: {
    e: '🔗', name: 'linking', g: 'D', pre: ['compiler', 'library'], re: /\blink(?:er|ers|ing|ed|s)?\b|undefined reference/i,
    why: "Real programs use code written by other people: printing, maths, MPI. Your file only says 'here I call printf'. Something has to connect that call to the real code.",
    simple: 'The step that joins your compiled code with the library code it uses.',
    kitten: "Your code says 'call printf', but printf isn't in your file. The linker finds printf in a library and plugs it in, so the finished program is complete.",
    zero: "Imagine a recipe that says 'use the standard sauce' without writing the sauce. Before cooking, someone must attach the sauce recipe. The linker does that attaching. If it can't find the sauce it stops with `undefined reference to ...`.",
    cats: "Your note says 'ask the neighbour cat for the key'. The linker is the one who actually puts you in touch with the neighbour.",
    technical: "The linker combines object files and libraries into one executable and resolves symbols: every function you call must be defined somewhere. `undefined reference to 'sqrt'` means the linker found a call but no definition, usually a missing `-lm` or the library placed before the source files on the command line.",
    prof: 'The lecturer warns about linking errors because they are the most common failure when building MPI programs.',
    next: 'how to tell the linker which library to use: flags.',
    ex: 'gcc main.c -o main -lm',
    lines: [['gcc', 'the compiler (and, afterwards, the linker)'], ['main.c', 'your source file'], ['-o main', 'name the finished program main'], ['-lm', 'link the maths library (libm), which contains sqrt, sin and so on']],
    miss: ["Linking errors are not mistakes in your C code. The code is fine; the linker just can't find where something is defined.", 'Order matters with GNU tools: libraries go after the source files.'],
    quiz: { q: "You see `undefined reference to 'sqrt'`. What is the likely fix?", code: '', opts: ['Rewrite sqrt', 'Add -lm at the end of the command', 'Run the program with sudo'], ans: 1, why: 'sqrt lives in the maths library. `-lm` tells the linker to use it.' }
  },
  flag: {
    e: '🚩', name: 'flag', g: 'D', pre: ['command', 'compiler'], re: /\b(?:flags?|options?)\b|\bdash\s+(?:o|l\s?m|n\s?p|w\s?all|o\s?[0-3])\b|(?:^|\s)-(?:o|lm|O[0-3s]|Wall|np)\b/i,
    why: 'One command can do many slightly different jobs. Flags let you say which variation you want without changing the program.',
    simple: 'An extra word after a command, starting with a dash, that changes how it behaves.',
    kitten: "A flag is an option you add to a command, like ordering 'with oat milk'. `-o hello` says: call the output file hello. Flags begin with `-`.",
    zero: 'The command is the main action. Flags come after it and begin with a dash. Some are on/off (`-Wall`), some need a value right after them (`-o hello`, `-np 4`).',
    cats: 'Flags are the little settings on the cat feeder: `-portion 2`, `-time 8am`.',
    technical: 'Flags (options) are command-line arguments that modify behaviour, usually `-x` (short) or `--word` (long). For gcc: `-o file` output name, `-O2` optimisation level 2, `-Wall` common warnings, `-lname` link a library, `-I dir` header search path, `-L dir` library search path.',
    prof: 'Flags are introduced because every compile and run command from here on uses them.',
    next: 'flags specific to MPI: mpicc and mpirun.',
    ex: 'gcc -O2 -Wall main.c -o main -lm',
    lines: [['gcc', 'the compiler'], ['-O2', 'optimise the machine code (level 2) so it runs faster'], ['-Wall', 'show all the common warnings'], ['main.c', 'the source file to compile'], ['-o main', 'name the output file main (the word after -o is the name)'], ['-lm', 'link the maths library']],
    miss: ["`-o` takes the next word as its value. Without that word the command is incomplete.", 'Case matters: `-o` (output name) and `-O2` (optimise) are different flags.'],
    quiz: { q: 'In `gcc main.c -o app`, what is `app`?', code: '', opts: ['a second source file', 'the name of the output file', 'a library'], ans: 1, why: '`-o` takes the next word as the output name.' }
  },
  mpicc: {
    e: '🧰', name: 'mpicc', g: 'C', pre: ['compiler', 'mpi'], re: /\bmpicc\b|\bm\s?p\s?i\s?c\s?c\b/i,
    why: 'MPI programs need extra header files and libraries. Typing all those paths by hand is tedious and different on every machine.',
    simple: 'A compiler command that already knows where MPI lives.',
    kitten: '`mpicc` is the normal C compiler with the MPI settings already filled in. You use it instead of `gcc` for MPI programs.',
    zero: "MPI is a library, so compiling an MPI program means the compiler has to find MPI's header files and the linker has to find its libraries. `mpicc` is a small wrapper that calls your real compiler (for example gcc) and adds all of that for you.",
    cats: 'mpicc is gcc wearing the MPI uniform.',
    technical: '`mpicc` is the C compiler wrapper supplied by an MPI implementation. It runs the underlying compiler with the include and link options MPI needs. To see the exact command, use `mpicc -show` (MPICH) or `mpicc --showme` (Open MPI).',
    prof: "The lecturer says not to call gcc directly for MPI programs.",
    next: 'starting the finished program with mpirun.',
    ex: 'mpicc hello_mpi.c -o hello_mpi',
    lines: [['mpicc', 'compile with the MPI-aware compiler wrapper'], ['hello_mpi.c', 'your MPI source file'], ['-o hello_mpi', 'name the executable hello_mpi']],
    miss: ['mpicc is not a different language; it calls your normal compiler.', 'Compiling with mpicc does not start several processes. That happens when you run the program with mpirun (or in a job).']
  },
  mpirun: {
    e: '🚀', name: 'mpirun', g: 'C', pre: ['mpi', 'process', 'command'], re: /\bmpirun\b|\bmpiexec\b|\bm\s?p\s?i\s?run\b/i,
    why: 'An MPI program is meant to run as several cooperating copies. Something has to start those copies and connect them.',
    simple: 'The command that starts your MPI program as several processes at once.',
    kitten: '`mpirun -np 4 ./hello_mpi` means: start 4 copies of hello_mpi that can talk to each other.',
    zero: 'Normally `./hello_mpi` starts one copy of a program. For MPI you want several copies running at the same time. `mpirun` starts them, and `-np 4` says how many. Each copy is a separate process.',
    cats: 'mpirun is the person who opens the door for four identical cats at once.',
    technical: '`mpirun` (or `mpiexec`) is the MPI launcher: it starts N processes of the program and sets up communication between them. `-np N` sets N. On a cluster, your course may start MPI programs through Slurm (`srun`, or inside an `sbatch` script) instead of calling mpirun yourself.',
    prof: 'The lecturer shows how to run the program you just compiled.',
    next: 'what each process does with its rank.',
    ex: 'mpirun -np 4 ./hello_mpi',
    lines: [['mpirun', 'the launcher that starts MPI programs'], ['-np 4', 'start 4 processes (np = number of processes)'], ['./hello_mpi', "the executable to run; ./ means 'in this folder'"]],
    miss: ['`-np 4` does not make a program four times faster by itself. The program has to split its work between ranks.', 'Running `./hello_mpi` directly usually starts just one process.'],
    quiz: { q: 'What does `mpirun -np 4 ./a.out` start?', code: '', opts: ['one process that uses 4 GB', 'four processes running ./a.out', 'four different programs'], ans: 1, why: '`-np` is the number of processes. All four run the same program.' }
  },
  rank: {
    e: '🏷️', name: 'rank', g: 'C', pre: ['process', 'mpi'], re: /\branks?\b|MPI[_ ](?:underscore )?Comm[_ ](?:underscore )?rank/i,
    why: 'If four identical copies of a program run, each one needs to know which copy it is, so that each can take its own part of the work.',
    simple: "A process's own number inside an MPI program: 0, 1, 2, ...",
    kitten: 'Every copy of your program gets a different number, its rank. It starts at 0. A copy can ask MPI for its rank and then decide what to do.',
    zero: "Imagine four people given exactly the same instructions. To split the work ('you take the first quarter') each needs a number. That number is the rank. It starts at 0, not 1, so with four people the ranks are 0, 1, 2 and 3.",
    cats: 'Four identical cats, each wearing a numbered collar: 0, 1, 2, 3.',
    technical: 'In MPI, the rank is an integer identifying a process within a communicator, from 0 to size-1. `MPI_Comm_rank(comm, &rank)` returns the calling process\'s rank; `MPI_Comm_size` returns the number of processes.',
    prof: 'Ranks are how one program behaves differently in each process, which is the whole point of MPI.',
    next: 'the communicator the ranks live in, then MPI_Reduce.',
    ex: `int rank;\nMPI_Comm_rank(MPI_COMM_WORLD, &rank);\nprintf("I am rank %d\\n", rank);`,
    lines: [['int rank;', 'make a variable called rank to hold a number'], ['MPI_Comm_rank(MPI_COMM_WORLD, &rank);', "ask MPI: 'what is my number in the group of all processes?'. &rank passes rank's address so the function can write the answer into it"], ['printf("I am rank %d\\n", rank);', 'print the number; %d is replaced by the value of rank']],
    miss: ['Rank is not importance or speed. It is just a number.', 'Ranks start at 0, not 1.', 'Every process has its own rank, so the same program prints a different answer in each process.'],
    quiz: { q: 'You start 4 processes. Which ranks exist?', code: '', opts: ['1, 2, 3, 4', '0, 1, 2, 3', '0 to 4'], ans: 1, why: 'Ranks start at 0 and go up to size - 1, so 0, 1, 2, 3.' }
  },
  communicator: {
    e: '👥', name: 'communicator', g: 'C', pre: ['rank'], re: /\bcommunicators?\b|COMM[_ ](?:underscore )?WORLD/i,
    why: 'Processes need to know who they can talk to. A communicator is a named group of processes that can exchange messages.',
    simple: 'A named group of processes that can send each other messages.',
    kitten: '`MPI_COMM_WORLD` is the group chat that contains every process that was started together. Ranks are numbers inside that group.',
    zero: "When you start 4 processes, MPI puts them all into one group called MPI_COMM_WORLD. A rank only means something inside a group: 'rank 2' means 'process number 2 in this group'. You can make smaller groups later; for now one group is all you need.",
    cats: 'MPI_COMM_WORLD is the whole cat cafe; a communicator can also be just the three cats by the window.',
    technical: 'A communicator is an MPI object defining a group of processes and a communication context. `MPI_COMM_WORLD` contains all processes started by the launcher. Ranks are relative to a communicator, and most MPI calls take the communicator they operate on.',
    prof: 'The lecturer introduces MPI_COMM_WORLD as the default group used in every example.',
    next: 'collective operations such as MPI_Reduce.',
    ex: 'int size;\nMPI_Comm_size(MPI_COMM_WORLD, &size);',
    lines: [['int size;', 'a variable to hold the number of processes'], ['MPI_Comm_size(MPI_COMM_WORLD, &size);', 'ask MPI how many processes are in the group of all processes']],
    miss: ['MPI_COMM_WORLD is not a special process; it is a group.', 'A rank only has a meaning inside one communicator.']
  },
  mpi_init: {
    e: '🔌', name: 'MPI_Init', g: 'C', pre: ['mpi', 'process'], re: /MPI[_ ](?:underscore )?init(?![a-z])/i,
    why: 'Before the processes can talk to each other, MPI has to set up the connections between them.',
    simple: 'The call that switches MPI on. It must come first.',
    kitten: "`MPI_Init` is 'open the line': every process calls it once at the start, before using any other MPI function.",
    zero: 'MPI is a library full of functions. Before using them, it needs to prepare itself: find the other processes and set up communication. `MPI_Init` does that preparation. Think of plugging in a telephone before dialling.',
    cats: 'Each cat puts on its collar so the others can recognise it.',
    technical: '`MPI_Init(&argc, &argv)` initialises the MPI execution environment. Every process must call it, once, before any other MPI routine (with a few exceptions such as `MPI_Initialized`). Since MPI-2 you may pass `NULL, NULL` if the program does not use command-line arguments. Its partner is `MPI_Finalize`.',
    prof: 'The lecturer says no MPI call is allowed before init.',
    next: 'MPI_Finalize, then asking for your rank.',
    ex: 'int main(int argc, char **argv) {\n    MPI_Init(&argc, &argv);\n    /* ... your MPI code ... */\n    MPI_Finalize();\n    return 0;\n}',
    lines: [['int main(int argc, char **argv) {', 'the start of every C program; argc/argv carry the command-line arguments'], ['MPI_Init(&argc, &argv);', 'switch MPI on; passes the arguments so MPI can read any launch information'], ['/* ... your MPI code ... */', 'all other MPI calls go here, between Init and Finalize'], ['MPI_Finalize();', 'switch MPI off'], ['return 0;', 'end the program normally']],
    miss: ['MPI_Init does not start the other processes. mpirun (or the job) already did that.', 'Calling an MPI function before MPI_Init is an error.'],
    quiz: { q: 'Where does MPI_Init belong?', code: '', opts: ['At the start, before other MPI calls', 'At the end', "Anywhere, it doesn't matter"], ans: 0, why: 'MPI must be initialised before other MPI calls.' }
  },
  mpi_finalize: {
    e: '🏁', name: 'MPI_Finalize', g: 'C', pre: ['mpi_init'], re: /MPI[_ ](?:underscore )?finalize/i,
    why: 'MPI holds resources such as connections and buffers. It needs a clean shutdown, and every process should leave in an orderly way.',
    simple: 'The call that switches MPI off. It must come last.',
    kitten: "`MPI_Finalize` is 'hang up the phone': every process calls it once when it is done with MPI.",
    zero: 'After your last MPI call, `MPI_Finalize` tells MPI you are finished so it can release what it was using. After it you may not use MPI any more.',
    cats: 'The cats all sit down and the cafe closes.',
    technical: '`MPI_Finalize()` terminates the MPI environment. Pending communication must be complete before it, and no further MPI calls (apart from a few queries such as `MPI_Finalized`) may follow. Every process must call it.',
    prof: 'The lecturer pairs it with MPI_Init: every MPI program begins and ends with them.',
    next: 'asking MPI who you are: rank.',
    ex: 'MPI_Finalize();\nreturn 0;',
    miss: ['Forgetting MPI_Finalize can make a program print warnings or misbehave when it exits.', "It does not exit the program by itself; `return 0` does that."]
  },
  mpi_reduce: {
    e: '➕', name: 'MPI_Reduce', g: 'C', pre: ['rank', 'communicator', 'mpi_init'], re: /MPI[_ ](?:underscore )?reduce/i,
    why: 'Often each process computes a partial result, for example a sum over its own part of the data. Someone has to combine the parts.',
    simple: 'Combines one value from every process into a single result, such as the sum.',
    kitten: 'Four processes each hold a number. `MPI_Reduce` adds them (or finds the largest, ...) and hands the answer to one chosen process.',
    zero: 'Imagine four people who each counted part of the coins. To get the total they all hand their counts to one person, who adds them up. MPI_Reduce is that hand-in-and-add step, done by MPI for you.',
    cats: 'Each cat reports how many mice it caught; the head cat receives the total.',
    technical: '`MPI_Reduce(sendbuf, recvbuf, count, datatype, op, root, comm)` applies `op` (`MPI_SUM`, `MPI_MAX`, ...) element by element across all processes\' send buffers and stores the result in `recvbuf` on the `root` rank. The result is only defined at the root. `MPI_Allreduce` gives it to everyone.',
    prof: 'It is the first collective operation: all processes take part in one call.',
    next: 'other collective operations such as broadcast.',
    ex: 'MPI_Reduce(&local, &total, 1, MPI_INT, MPI_SUM, 0, MPI_COMM_WORLD);',
    lines: [['&local', "this process's own value (the address of the variable local)"], ['&total', 'where the combined result is written, on the root rank only'], ['1', 'how many values each process sends'], ['MPI_INT', 'the values are ints'], ['MPI_SUM', 'combine them by adding'], ['0', 'the root: the rank that receives the result'], ['MPI_COMM_WORLD', 'the group of processes taking part']],
    miss: ["Only the root rank receives the result; on other ranks 'total' is not meaningful.", 'Every process must call MPI_Reduce. It is a collective call, not something only the root does.'],
    quiz: { q: 'After MPI_Reduce(..., MPI_SUM, 0, ...), who holds the total?', code: '', opts: ['Every process', 'Only rank 0', 'Nobody'], ans: 1, why: 'The result is stored on the root rank, here 0.' }
  }
});

/* Extra teaching material for concepts that already existed in kb-base.js */
Object.assign(KB.and, { lines: [['mkdir cats', 'first command: create a folder called cats'], ['&&', "'and then, but only if the left side worked'"], ['cd cats', 'second command: enter the folder; it runs only if mkdir succeeded']], miss: ["&& is not the English 'and also': the right-hand side can be skipped.", "It does not look at what the left command printed, only at whether it succeeded."] });
Object.assign(KB.or, { lines: [['ls missing', 'first command: this fails because there is no such file'], ['||', "'or else, if the left side failed'"], ['echo "not found"', 'second command: runs only because the first failed']], miss: ['`||` runs the right side only on failure. If the left side succeeds, the right side never runs.'] });
Object.assign(KB.exitcode, { steps: ['A command runs.', 'When it finishes it hands back a number, the exit code.', '0 means it worked; any other number means a kind of failure.', 'The shell keeps the last one in `$?`.', 'You can read it with `echo $?`.'], miss: ['0 means success. That is the opposite of how many programming languages treat 0 (as false).', 'The exit code is not what the command prints on the screen.'] });
Object.assign(KB.sbatch, { steps: ['Write a script (for example job.sh) that says what to run.', 'Run `sbatch job.sh`.', 'Slurm answers with a job ID and returns immediately.', 'The job waits in the queue, then runs on a node.', 'Check progress with squeue.'], miss: ['sbatch does not run your program in your terminal; it hands the job to the scheduler.', 'Seeing a job ID does not mean the job has started, only that it was accepted.'] });
Object.assign(KB.mpi, { miss: ['MPI is not a programming language. It is a library (a set of functions) that you call from C, Fortran and others.', 'MPI processes do not share memory; data moves only through messages.'] });

export { KB, GROUPS };
