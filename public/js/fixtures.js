// Development fixtures. They are clearly labelled in the UI ("sample"), never presented as a real lecture or as AI output.
export function demoLecture(){return{id:"demo",courseId:"esc401",moduleId:"mod-w4",fixture:"esc401-w4",transcriptSource:"fixture",tags:[],cleanEdits:{},cleanAdds:[],playPos:0,title:"Lecture 4",date:"2026-10-07",demo:true,status:"ready",duration:1860,hasAudio:false,segments:[
{t:5,text:"Okay, so, um, welcome back everyone. Today we're going to look at how you actually run things on the cluster."},
{t:70,text:"So every time you type something in the shell, that's a command. And every command, when it finishes, hands back a number. We call that the exit code."},
{t:160,text:"Zero means success. Anything that is not zero means something went wrong. This is, uh, kind of backwards from what you'd expect, but remember this, it's the opposite of how most languages treat zero."},
{t:260,text:"So you can ask bash what the last exit code was, with dollar question mark.",say:"dollar question mark",code:"$?"},
{t:480,text:"Now, if I write mkdir cats, then two ampersands, then cd cats, the second command only runs if the first one worked.",say:"mkdir cats, then two ampersands, then cd cats",code:"mkdir cats && cd cats"},
{t:570,text:"That's the and operator. And there's the or operator, which is two pipes. It runs the second thing only if the first one failed.",code:"ls missing || echo \"not found\""},
{t:734,text:"So if this is false, then it knows the whole expression can't be true, so it doesn't do the second part. That's what short-circuiting is."},
{t:820,text:"The key point is that bash doesn't evaluate the right-hand side at all. Be careful here, a common mistake is to assume both sides always run."},
{t:960,text:"Okay, let's switch gears. You don't run big jobs on the login node. You submit them to the scheduler."},
{t:1050,text:"The scheduler on our cluster is Slurm. You write a script and you submit it with s batch.",say:"s batch",code:"sbatch job.sh"},
{t:1150,text:"Then to check on it you use ess queue dash jay and the job id.",say:"ess queue dash jay and the job id",code:"squeue -j \"$server_job\"",unsure:{alts:["squeue -j \"$SLURM_JOB_ID\"","squeue -u \"$USER\"","squeue -j \"$server_job\""]}},
{t:1260,text:"A node is basically one computer in the cluster. Our cluster has, I think, about two hundred nodes."},
{t:1410,text:"This is important: a job is what you ask the scheduler for, a process is what actually runs on the node."},
{t:1560,text:"Now, to use more than one core, there are two main approaches. OpenMP shares memory inside one node."},
{t:1680,text:"MPI, on the other hand, lets separate processes, even on different nodes, send messages to each other. We'll use this later in the course."},
{t:1800,text:"For next week, try submitting a hello world job and look at the exit code."}
]}}


/* Sample transcript for a "Week 3 - Linking and Compilation" lecture. Offered only as an explicit, labelled button. */
export const WEEK3_SAMPLE=[
{t:5,text:"Okay, welcome back. Last week we ran our first commands in the shell. Today we're going to compile and link C programs, and then write our first MPI program."},
{t:60,text:"A compiler takes your C source file and translates it into an executable, which is a file the computer can actually run. Remember this: compiling is not running."},
{t:140,text:"So you write gcc hello dot c, dash o, hello. And then dot slash hello runs it.",say:"gcc hello dot c, dash o, hello",code:"gcc hello.c -o hello"},
{t:230,text:"The dash o flag names the output file. If you leave it out, gcc calls the result a dot out."},
{t:310,text:"Now linking. Your code calls printf, but printf lives in a library. The linker is the step that connects your code to that library. If it can't find the code you get undefined reference to."},
{t:380,text:"The common mistake is using something like sqrt and forgetting dash l m at the end of the command.",code:"gcc main.c -o main -lm"},
{t:420,text:"Be careful here: the order matters. Put the libraries after the source files, not before."},
{t:520,text:"For MPI programs we don't call gcc directly. We use mpicc, which is a wrapper that adds the right include paths and libraries for you.",code:"mpicc hello_mpi.c -o hello_mpi"},
{t:640,text:"Every MPI program starts with MPI underscore init and ends with MPI underscore finalize. This is important: no other MPI call is allowed before init.",say:"MPI underscore init",code:"MPI_Init(&argc, &argv);",unsure:{alts:["MPI_Init(&argc, &argv);","MPI_Init(NULL, NULL);"]}},
{t:700,text:"Then at the very end you call MPI underscore finalize.",say:"MPI underscore finalize",code:"MPI_Finalize();"},
{t:760,text:"Each process gets a rank. Rank zero, rank one, and so on. You ask for your own rank with MPI underscore Comm underscore rank.",say:"MPI underscore Comm underscore rank",code:"MPI_Comm_rank(MPI_COMM_WORLD, &rank);"},
{t:880,text:"The communicator, MPI underscore COMM underscore WORLD, is the group of all processes that were started together."},
{t:1000,text:"Then we run it with mpirun dash n p four, dot slash hello underscore mpi. The dash n p flag is the number of processes.",say:"mpirun dash n p four, dot slash hello underscore mpi",code:"mpirun -np 4 ./hello_mpi"},
{t:1120,text:"You should understand the difference between a compile time error and a run time error. We'll use this later when we debug on the cluster."},
{t:1240,text:"Exercise for next week: compile hello underscore mpi, run it with four processes, and print each rank. Submit it by Friday."},
{t:1320,text:"Also, please read chapter two of the MPI tutorial before the next lecture."}
];
