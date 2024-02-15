<?php
	error_reporting(E_ALL);
	// blxremote.php - Data uploader - JoEmbedded.de
	// Test: http://localhost/wrk/joemdash/sync/blxremote.php
	// oder  https://joembedded.de/wrk/fetch/blxremote.php
	
	// --- Write alternating Logfiles ('.php' prevents readout) ---
	function addlog($xlog)
	{
		$logpath = "./";
		if (@filesize($logpath . "log.log.php") > 1000000) {	// Shift Logs
			@unlink($logpath . "_log_old.log.php");
			@rename($logpath . "log.log.php", $logpath . "_log_old.log.php");
			$xlog .= " ('log.log.php' -> '_log_old.log.php')";
		}
		$log = @fopen($logpath . "log.log.php", 'a');
		if ($log) {
			while (!flock($log, LOCK_EX)) usleep(10000);  // Lock File - Is a MUST
			fputs($log, gmdate("d.m.y H:i:s ", time()) . $_SERVER['REMOTE_ADDR']);        // Write file
			fputs($log, " $xlog\n");        // evt. add extras
			flock($log, LOCK_UN);
			fclose($log);
		}
	}

	function exit_error($err){
		echo "ERROR: $err";
		exit();
	}

	// --- MAIN ---
	$mtmain_t0 = microtime(true);         // for Benchmark 
	$xlog = "blxremote.php: ";

	header('Content-Type: application/json; charset=utf-8');
	// CORS WRAPPER
	header('Access-Control-Allow-Origin: *');
	header('Access-Control-Allow-Credentials: true');
	header('Access-Control-Allow-Methods: *'); // Mit Wildcard Access: kein 'includ' bei fetch()
	header('Access-Control-Allow-Headers: *'); 


	// Verschiedenen Arten des Requests - Fuer Dbg
	 file_put_contents("dbg_request.txt",var_export($_REQUEST,true)); // Named Parameter
	 file_put_contents("dbg_body.txt",file_get_contents('php://input')); // fetch-body Parameter

	$body_arg = file_get_contents('php://input'); 
	if (strlen($body_arg)<2 || $body_arg[0] !== '{') exit_error("JSON entity missing");
	
	$data = array("LEN"=>strlen($body_arg), time());

	echo json_encode($data);
	
	$mtrun = round((microtime(true) - $mtmain_t0) * 1000, 4);
	$xlog .= "(Run:$mtrun msec)"; // Script Runtime
	addlog($xlog); // Regular exit, entry in logfile should be first
?>