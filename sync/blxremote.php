<?php
	// blxremote.php - Data uploader - JoEmbedded.de
	// Test: http://localhost/wrk/joemdash/sync/blxremote.php
	// oder  https://joembedded.de/wrk/fetch/blxremote.php

	error_reporting(E_ALL);

	
	
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


	// --- MAIN ---
	$mtmain_t0 = microtime(true);         // for Benchmark 
	$xlog = "blxremote.php: ";

	header('Content-Type: application/json; charset=utf-8');
	// CORS WRAPPER
	header('Access-Control-Allow-Origin: *');
	header('Access-Control-Allow-Credentials: true');
	header('Access-Control-Allow-Methods: *'); // Mit Wildcard Access: kein 'include' bei fetch()
	header('Access-Control-Allow-Headers: *'); 

	// Verschiedenen Arten des Requests - //DBG
	//file_put_contents("dbg_request.txt",var_export($_REQUEST,true)); // Named Parameter
	//file_put_contents("dbg_body.txt",file_get_contents('php://input')); // fetch-body Parameter

	$raw_arg = file_get_contents('php://input'); 
	$reply = array();

	try{
		$key = @$_REQUEST['k'];
		if($key !== '123456') throw new Exception ("Access denied");

		$cmd = @$_REQUEST['cmd'];
		if(!isset($cmd)) $cmd = '';
		$xlog .= "(CMD:'$cmd')";

		if (strlen($raw_arg)<2 || $raw_arg[0] !== '{') throw new Exception ("JSON entity missing");
		$args = json_decode($raw_arg, true); //true: Arg. in $args[] as Ass.Array

		$mac = @$args['mac'];
		if (strlen($mac) != 16) throw new Exception("MAC len");
		$mac = strtoupper($mac);
		$filename = @$args['filename'];
		if (!isset($filename) || !strlen($filename) ) throw new Exception("No Filename");
		if (!isset($args['data'])) throw new Exception ("No 'data'");
		if(!file_exists("./$mac/")){
			mkdir("./$mac");
			$xlog .= "(Gen Dir '$mac')";
		}
		$data = json_encode($args['data']);
		file_put_contents("./$mac/$filename",$data);
		$olen = strlen($data);
		if( $olen >10240) $dlen = round($olen/1024,3)."kB";
		else $dlen = $olen."kB";
		$xlog .= "($mac/$filename => $dlen)";
		$reply['status'] = "OK";
	} catch(Exception $e) {
		$xmsg = 'ERROR: '.$e->getMessage();
		$reply['status'] = $xmsg;
	}
	$reply['timestamp'] = time();

	echo json_encode($reply);
	//file_put_contents("dbg_reply.txt",$reply); //DBG
	
	$mtrun = round((microtime(true) - $mtmain_t0) * 1000, 4);
	$xlog .= "(Run:$mtrun msec)"; // Script Runtime
	addlog($xlog); // Regular exit, entry in logfile should be first
?>