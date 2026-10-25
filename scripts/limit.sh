#!/bin/sh
# Run a command with a time limit, and kill its whole process group when the limit passes.
# macOS has no timeout(1). Usage: scripts/limit.sh <seconds> <command> [args...]
secs=$1; shift
exec perl -e '
	my $s = shift; my $pid = fork;
	if ($pid == 0) { setpgrp(0, 0); exec @ARGV or die "exec: $!" }
	$SIG{ALRM} = sub { print STDERR "\nlimit.sh: stopped after ${s}s: @ARGV\n"; kill "TERM", -$pid; sleep 2; kill "KILL", -$pid; exit 124 };
	alarm $s; waitpid($pid, 0); exit($? >> 8)
' "$secs" "$@"
