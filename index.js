// Load required packages
var express = require('express');
var http = require('http');
var app = express();
var server = app.listen(3000);
var compression = require('compression');
var io = require('socket.io').listen(server);
var serialport = require('serialport');
var SerialPort = serialport.SerialPort;
var usb = require('usb');

// Add content compression middleware
app.use(compression());

// Add static middleware
app.use(express.static(__dirname + '/client'));

io.on('connection', function(socket) {
    console.log('a user connected');
    socket.on('list ports', function() {
        serialport.list(function (err, ports) {
            var port_list = [];
            ports.forEach(function(port) {
                if (port.manufacturer != "Battman Virtual COM Port")
                    return;
                port_list.push(port);
                console.log(port.comName);
            });
            socket.emit('list ports', {list: port_list});
        });
    });
    usb.on('detach', function(device) {
        serialport.list(function (err, ports) {
            var port_list = [];
            ports.forEach(function(port) {
                if (port.manufacturer != "Battman Virtual COM Port")
                    return;
                port_list.push(port);
                console.log(port.comName);
            });
            socket.emit('list ports', {list: port_list});
        });
    });
    socket.on('connect port', function(portName) {
        if (portName == "")
            return;
        var port = new SerialPort(portName, {
            parser: serialport.parsers.byteDelimiter(0x0A),
            baudRate: 115200,
            lock: false
        });
	port.on('open', function () {
            port.on('disconnect', function(err) {
                socket.emit('disconnect port');
            });
	    function hex(num) {
                return String.fromCharCode(num);
            }
            function hexString(array) {
                return array
                    .map(hex)
                    .join('');
	    }
	    function f32bit_double(x) {
		// handle sign bit
		if (x < 0) {
		    x += 2147483648;
		    s = -1;
		} else {
		    s = 1;
		}

		r = x % 8388608; // raw significand
		e = (x-r) >> 23; // raw exponent

		if (e === 0) {
		    // subnormal
		    e -= 126;
		    r = r/8388608;
		} else if (e == 255) {
		    // inf or nan
		    return r === 0 ? s*Infinity : NaN;
		} else {
		    // normalised
		    e -= 127;
		    r = 1+r/8388608;
		}
		return s*r*Math.pow(2,e);
	    }
	    var Cmd = {
		START: 0x50,
		END: 0x0A,
		PACKET_CONNECT: 0x00,
		PACKET_CONSOLE: 0x01,
		PACKET_GET_DATA: 0x02
	    };

	    console.log('Connected to', portName);
	    var handshake = new Buffer(3);
	    handshake[0] = Cmd.START;
	    handshake[1] = Cmd.PACKET_CONNECT;
	    handshake[2] = Cmd.END;
	    port.write(handshake, function(err, bytesWritten) {
		if (err) {
		    return console.log('Error: ', err.message);
		}
	    });
            socket.emit('connect port');
            socket.on('serial send', function(data) {
                console.log(data);
                var buffer = new Buffer(data + '\n', "ascii");
                console.log(buffer);
                var header = new Buffer(2);
                header[0] = Cmd.START;
                header[1] = Cmd.PACKET_CONSOLE;
                var send = Buffer.concat([header, buffer], header.length + buffer.length);
                console.log(send);
                port.write(send, function(err, bytesWritten) {
                    if (err) {
                        return console.log('Error: ', err.message);
                    }
                });
            });
            socket.on('set duty', function(data) {
                console.log(data);
                var buffer = new Buffer(5);
                buffer[0] = Cmd.START;
                buffer[1] = Cmd.PACKET_SET_DUTY_CYCLE;
                buffer[2] = (data & 0xFF00) >> 8;
                buffer[3] = (data & 0x00FF);
                buffer[4] = Cmd.END;
                port.write(buffer, function(err, bytesWritten) {
                    if (err) {
                        return console.log('Error: ', err.message);
                    }
                });
            });
	    var requestData = function() {
                var req = new Buffer(3);
                req[0] = Cmd.START;
                req[1] = Cmd.PACKET_GET_DATA;
                req[2] = Cmd.END;
                port.write(req, function(err, bytesWritten) {
                    if (err) {
                        return console.log('Error: ', err.message);
                    }
                });
	    }
	    var run = setInterval(requestData, 100);
            port.on('data', function(data)
                    {
                        //console.log(data);
                        if (data[0] == Cmd.START && data[1] == Cmd.PACKET_CONSOLE)
                        {
                            socket.emit('serial receive', hexString(data.slice(2, -1)));
                        }
                        else if (data[0] == Cmd.START && data[1] == Cmd.PACKET_GET_DATA)
                        {
                            if (data.slice(2, -1).length % 4 != 0)
                                return;
                            var uint8 = new Uint8Array(data.slice(2, -1));
                            var values = new Int32Array(uint8.buffer);
                            var voltage = f32bit_double(values[0]).toFixed(2);
                            var temp = f32bit_double(values[1]).toFixed(2);
                            var current = f32bit_double(values[2]).toFixed(2);
                            var chargeVoltage = f32bit_double(values[3]).toFixed(2);
			    //var state = uint8[5];
			    //var fault = uint8[7];
                            data = {current: current, charge_voltage: chargeVoltage};
                            socket.emit('graph', data);
                            socket.emit('voltage', voltage);
                            socket.emit('temperature', temp);
                            //socket.emit('status_update', {state: state, fault: fault});
                        }
                    });
            socket.on('disconnect', function()
                    {
                        port.close(function(err)
                                {
                                });
                    });
            socket.on('disconnect port', function()
                    {
                        port.close(function(err)
                                {
                                    socket.emit('disconnect port');
                                });
                    });
        });
    });
});

// Create our Express router
var router = express.Router();

// Register all our routes
app.use(router);
