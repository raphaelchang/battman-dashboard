process.setMaxListeners(0);
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
var multer= require('multer');
var storage = multer.memoryStorage();
var upload = multer({ storage: storage });
var fb = require('float-bits');

// Add content compression middleware
app.use(compression());

// Add static middleware
app.use(express.static(__dirname + '/client'));

var firmware_update = function(req, res) { console.log("Firmware update function not defined") };
io.on('connection', function(socket) {
    console.log('a user connected');

    socket.on('list ports', function() {
        serialport.list(function (err, ports) {
            var port_list = [];
            ports.forEach(function(port) {
                if (process.platform == 'linux')
                {
                    if (port.serialNumber.split('_').slice(1, -1).join(' ') != "Battman Virtual COM Port")
                        return;
                    port.manufacturer = "Battman Virtual COM Port";
                    port.serialNumber = port.serialNumber.split('_').slice(-1)[0];
                }
                else
                {
                    if (port.manufacturer != "Battman Virtual COM Port")
                        return;
                }
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
    app.post('/update', upload.single('firmware'), function(req, res) {firmware_update(req, res)});
    var port;
    socket.on('connect port', function(portName) {
        if (portName == "")
            return;
        port = new SerialPort(portName, {
            parser: serialport.parsers.byteDelimiter(0x0A),
            baudRate: 115200,
            lock: false
        });
        port.on('open', function (err) {
            var Cmd = {
                START: 0x50,
                START_LONG: 0x51,
                END: 0x0A,
                PACKET_CONNECT: 0x00,
                PACKET_CONSOLE: 0x01,
                PACKET_GET_DATA: 0x02,
                PACKET_GET_CELLS: 0x03,
                PACKET_ERASE_NEW_FW: 0x04,
                PACKET_WRITE_NEW_FW: 0x05,
                PACKET_JUMP_BOOTLOADER: 0x06,
                PACKET_CONFIG_SET_FIELD: 0x07,
                PACKET_CONFIG_GET_FIELD: 0x08,
                PACKET_CONFIG_SET_ALL: 0x09,
                PACKET_CONFIG_GET_ALL: 0x0A
            };
            var configTable = [
                ["CANDeviceID", "uint8", 1],
                ["numCells", "uint8", 1],
                ["fullCellVoltage", "float", 4],
                ["emptyCellVoltage", "float", 4],
                ["packCapacity", "float", 4],
                ["lowVoltageCutoff", "float", 4],
                ["lowVoltageWarning", "float", 4],
                ["highVoltageCutoff", "float", 4],
                ["highVoltageWarning", "float", 4],
                ["maxCurrentCutoff", "float", 4],
                ["maxContinuousCurrent", "float", 4],
                ["continuousCurrentCutoffTime", "uint8", 1],
                ["continuousCurrentCutoffWarning", "uint8", 1],
                ["maxChargeCurrent", "float", 4],
                ["chargeVoltage", "float", 4],
                ["chargeCurrent", "float", 4],
                ["turnOnDelay", "uint16", 2],
                ["shutdownDelay", "uint16", 2],
                ["chargeMode", "uint8", 1],
                ["chargeCurrentGain_P", "float", 4],
                ["chargeCurrentGain_I", "float", 4],
                ["prechargeTimeout", "uint16", 2],
                ["balanceStartVoltage", "float", 4],
                ["balanceDifferenceThreshold", "float", 4],
                ["chargerDisconnectShutdown", "bool", 1]
            ];
            var Config = {
                FieldToID: {},
                IDToField: {},
                FieldToType: {}
            };
            var configSize = 0;
            for (j = 0; j < configTable.length; j++)
            {
                Config.FieldToID[configTable[j][0]] = configSize;
                Config.IDToField[configSize] = configTable[j][0];
                Config.FieldToType[configTable[j][0]] = configTable[j][1];
                configSize += configTable[j][2];
            }

            var connected = true;
            if (err)
            {
                return console.log('Error opening port: ', err.message);
            }
            port.on('disconnect', function(err) {
                connected = false;
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
            function uint16 (n) {
                return n & 0xFFFF;
            }
            function crc16(buffer) {
                var crc16_tab = new Uint16Array([ 0x0000, 0x1021, 0x2042, 0x3063, 0x4084,
                    0x50a5, 0x60c6, 0x70e7, 0x8108, 0x9129, 0xa14a, 0xb16b, 0xc18c, 0xd1ad,
                    0xe1ce, 0xf1ef, 0x1231, 0x0210, 0x3273, 0x2252, 0x52b5, 0x4294, 0x72f7,
                    0x62d6, 0x9339, 0x8318, 0xb37b, 0xa35a, 0xd3bd, 0xc39c, 0xf3ff, 0xe3de,
                    0x2462, 0x3443, 0x0420, 0x1401, 0x64e6, 0x74c7, 0x44a4, 0x5485, 0xa56a,
                    0xb54b, 0x8528, 0x9509, 0xe5ee, 0xf5cf, 0xc5ac, 0xd58d, 0x3653, 0x2672,
                    0x1611, 0x0630, 0x76d7, 0x66f6, 0x5695, 0x46b4, 0xb75b, 0xa77a, 0x9719,
                    0x8738, 0xf7df, 0xe7fe, 0xd79d, 0xc7bc, 0x48c4, 0x58e5, 0x6886, 0x78a7,
                    0x0840, 0x1861, 0x2802, 0x3823, 0xc9cc, 0xd9ed, 0xe98e, 0xf9af, 0x8948,
                    0x9969, 0xa90a, 0xb92b, 0x5af5, 0x4ad4, 0x7ab7, 0x6a96, 0x1a71, 0x0a50,
                    0x3a33, 0x2a12, 0xdbfd, 0xcbdc, 0xfbbf, 0xeb9e, 0x9b79, 0x8b58, 0xbb3b,
                    0xab1a, 0x6ca6, 0x7c87, 0x4ce4, 0x5cc5, 0x2c22, 0x3c03, 0x0c60, 0x1c41,
                    0xedae, 0xfd8f, 0xcdec, 0xddcd, 0xad2a, 0xbd0b, 0x8d68, 0x9d49, 0x7e97,
                    0x6eb6, 0x5ed5, 0x4ef4, 0x3e13, 0x2e32, 0x1e51, 0x0e70, 0xff9f, 0xefbe,
                    0xdfdd, 0xcffc, 0xbf1b, 0xaf3a, 0x9f59, 0x8f78, 0x9188, 0x81a9, 0xb1ca,
                    0xa1eb, 0xd10c, 0xc12d, 0xf14e, 0xe16f, 0x1080, 0x00a1, 0x30c2, 0x20e3,
                    0x5004, 0x4025, 0x7046, 0x6067, 0x83b9, 0x9398, 0xa3fb, 0xb3da, 0xc33d,
                    0xd31c, 0xe37f, 0xf35e, 0x02b1, 0x1290, 0x22f3, 0x32d2, 0x4235, 0x5214,
                    0x6277, 0x7256, 0xb5ea, 0xa5cb, 0x95a8, 0x8589, 0xf56e, 0xe54f, 0xd52c,
                    0xc50d, 0x34e2, 0x24c3, 0x14a0, 0x0481, 0x7466, 0x6447, 0x5424, 0x4405,
                    0xa7db, 0xb7fa, 0x8799, 0x97b8, 0xe75f, 0xf77e, 0xc71d, 0xd73c, 0x26d3,
                    0x36f2, 0x0691, 0x16b0, 0x6657, 0x7676, 0x4615, 0x5634, 0xd94c, 0xc96d,
                    0xf90e, 0xe92f, 0x99c8, 0x89e9, 0xb98a, 0xa9ab, 0x5844, 0x4865, 0x7806,
                    0x6827, 0x18c0, 0x08e1, 0x3882, 0x28a3, 0xcb7d, 0xdb5c, 0xeb3f, 0xfb1e,
                    0x8bf9, 0x9bd8, 0xabbb, 0xbb9a, 0x4a75, 0x5a54, 0x6a37, 0x7a16, 0x0af1,
                    0x1ad0, 0x2ab3, 0x3a92, 0xfd2e, 0xed0f, 0xdd6c, 0xcd4d, 0xbdaa, 0xad8b,
                    0x9de8, 0x8dc9, 0x7c26, 0x6c07, 0x5c64, 0x4c45, 0x3ca2, 0x2c83, 0x1ce0,
                    0x0cc1, 0xef1f, 0xff3e, 0xcf5d, 0xdf7c, 0xaf9b, 0xbfba, 0x8fd9, 0x9ff8,
                    0x6e17, 0x7e36, 0x4e55, 0x5e74, 0x2e93, 0x3eb2, 0x0ed1, 0x1ef0 ]);
                var cksum = 0;
                for (inx = 0; inx < buffer.length; inx++) {
                    cksum = uint16(uint16(crc16_tab[((uint16((cksum >> 8)) ^ buffer[inx]) & 0xFF)]) ^ (uint16((cksum << 8))));
                }
                return cksum;
            }
            function bufferToPacket(cmd, buffer, longPacket = false)
            {
                var length = buffer.length + 1;
                var start = new Buffer(longPacket ? 3 : 2);
                start[0] = longPacket ? Cmd.START_LONG : Cmd.START;
                if (longPacket)
                    start.writeUInt16BE(length, 1);
                else
                    start[1] = length;
                var data = new Buffer(1);
                data[0] = cmd;
                data = Buffer.concat([data, buffer], length);
                var crc = new Buffer(2);
                crc.writeUInt16BE(crc16(data));
                var end = new Buffer(1);
                end[0] = Cmd.END;
                return Buffer.concat([start, data, crc, end], length + (longPacket ? 6 : 5));
            }
            var processState = 0;
            var packetData = [];
            var packetTimeout = 1000;
            var packetTimer = setTimeout(resetProcessState, packetTimeout);
            var packetLength;
            var packetCrc;
            function processPacketData(data)
            {
                for (i = 0; i < data.length; i++)
                {
                    switch (processState)
                    {
                        case 0:
                            if (data[i] == Cmd.START || data[i] == Cmd.START_LONG)
                            {
                                clearTimeout(packetTimer);
                                packetTimer = setTimeout(resetProcessState, packetTimeout);
                                if (data[i] == Cmd.START)
                                    processState = 2;
                                else
                                    processState = 1;
                                packetLength = 0;
                                packetData = [];
                            }
                            break;
                        case 1:
                            clearTimeout(packetTimer);
                            packetTimer = setTimeout(resetProcessState, packetTimeout);
                            packetLength = data[i] << 8;
                            processState++;
                            break;
                        case 2:
                            clearTimeout(packetTimer);
                            packetTimer = setTimeout(resetProcessState, packetTimeout);
                            packetLength |= data[i];
                            processState++;
                            break;
                        case 3:
                            clearTimeout(packetTimer);
                            packetTimer = setTimeout(resetProcessState, packetTimeout);
                            packetData.push(data[i]);
                            if (packetData.length >= packetLength)
                            {
                                processState++;
                            }
                            break;
                        case 4:
                            clearTimeout(packetTimer);
                            packetTimer = setTimeout(resetProcessState, packetTimeout);
                            packetCrc = data[i] << 8;
                            processState++;
                            break;
                        case 5:
                            clearTimeout(packetTimer);
                            packetTimer = setTimeout(resetProcessState, packetTimeout);
                            packetCrc |= data[i];
                            processState++;
                            break;
                        case 6:
                            clearTimeout(packetTimer);
                            packetTimer = setTimeout(resetProcessState, packetTimeout);
                            if (data[i] == Cmd.END)
                            {
                                processState = 0;
                                var ret =  packetData.slice();
                                packetData = [];
                                if (crc16(ret) == packetCrc)
                                {
                                    return ret;
                                }
                            }
                            break;
                    }
                }
                return [];
            }
            function resetProcessState()
            {
                processState = 0;
                packetTimer = setTimeout(resetProcessState, packetTimeout);
            }
            var updatingFirmware = false;

            console.log('Connected to', portName);
            socket.on('serial send', function(data) {
                if (updatingFirmware || !connected)
                    return;
                console.log(data);
                var buffer = new Buffer(data, "ascii");
                console.log(buffer);
                var send = bufferToPacket(Cmd.PACKET_CONSOLE, buffer);
                console.log(send);
                port.write(send, function(err, bytesWritten) {
                    if (err) {
                        return console.log('Error: ', err.message);
                    }
                });
            });
            var chunkSize = 256;
            firmware_update = function(req, res) {
                updatingFirmware = true;
                var sizebuf = new Buffer(4);
                sizebuf.writeUInt32BE(req.file.buffer.length);
                var crc = crc16(req.file.buffer);
                var crcbuf = new Buffer(2);
                crcbuf.writeUInt16BE(crc);
                firmware = Buffer.concat([sizebuf, crcbuf, req.file.buffer], req.file.buffer.length + 6);
                res.send({size: firmware.length});
                var erase = bufferToPacket(Cmd.PACKET_ERASE_NEW_FW, Buffer.alloc(0));
                var checkForReset = function() {
                    serialport.list(function (err, ports) {
                        var port_list = [];
                        ports.forEach(function(port) {
                            if (port.manufacturer != "Battman Virtual COM Port")
                                return;
                            port_list.push(port);
                        });
                        if (port_list.length > 0)
                        {
                            socket.emit('list ports', {list: port_list});
                            socket.emit('fw reset');
                        }
                        else
                            var timer = setTimeout(checkForReset, 500, "reset check");
                    });
                };
                var completed = function() {
                    updatingFirmware = false;
                    socket.emit('fw complete');
                    var send = bufferToPacket(Cmd.PACKET_JUMP_BOOTLOADER, Buffer.alloc(0));
                    port.write(send, function(err, bytesWritten) {
                        if (err) {
                            return console.log('Error: ', err.message);
                        }
                        port.close(function(err)
                                {
                                    connected = false;
                                    socket.emit('disconnect port');
                                    var timer = setTimeout(checkForReset, 500, "reset check");
                                });
                    });
                };
                var writeWrite = function(start, end, total, retryCount) {
                    if (retryCount > 10)
                        return;
                    var timer = setTimeout(function() {writeWrite(start, end, total, timer, retryCount + 1)}, 2000, "timeout");
                    var offset = new Buffer(4);
                    offset.writeUInt32BE(start);
                    var send = bufferToPacket(Cmd.PACKET_WRITE_NEW_FW, Buffer.concat([offset, firmware.slice(start, end)], end - start + 4), true);
                    port.write(send, function(err, bytesWritten) {
                        var complete = false;
                        port.on('data', function(data)
                                {
                                    data = processPacketData(data);
                                    if (!complete && data.length > 0)
                                    {
                                        if (data[0] == Cmd.PACKET_WRITE_NEW_FW)
                                        {
                                            var success = data[1];
                                            if (success == 0)
                                                return;
                                            complete = true;
                                            socket.emit('fw write', total + end - start);
                                            clearTimeout(timer);
                                            if (end == firmware.length)
                                                completed();
                                            else
                                                writeWrite(end, end + chunkSize > firmware.length ? firmware.length : end + chunkSize, total + end - start, 0);
                                        }
                                    }
                                });
                    });
                };
             var writeErase = function() {
                    var timer = setTimeout(function() {writeErase()}, 2000, "timeout");
                    port.write(erase, function(err, bytesWritten) {
                        if (err) {
                            return console.log('Error: ', err.message);
                        }
                        port.on('data', function(data)
                                {
                                    data = processPacketData(data);
                                    if (data.length > 0 && data[0] == Cmd.PACKET_ERASE_NEW_FW)
                                    {
                                        socket.emit('fw erase');
                                        clearTimeout(timer);
                                        writeWrite(0, chunkSize, 0, 0);
                                    }
                                });
                    });
                };
                writeErase();
            };
            socket.on('config change', function(data) {
                var idbuf = new Buffer(2);
                idbuf.writeUInt16BE(Config.FieldToID[data.field]);
                var databuf;
                switch(Config.FieldToType[data.field])
                {
                    case "uint8":
                        databuf = new Buffer(1);
                        databuf[0] = data.value;
                        break;
                    case "uint16":
                        databuf = new Buffer(2);
                        databuf.writeUInt16BE(data.value);
                        break;
                    case "uint32":
                        databuf = new Buffer(4);
                        databuf.writeUInt32BE(data.value);
                        break;
                    case "float":
                        databuf = new Buffer(4);
                        databuf.writeUInt32BE(fb.toUint(data.value));
                        break;
                }
                var send = bufferToPacket(Cmd.PACKET_CONFIG_SET_FIELD, Buffer.concat([idbuf, databuf]));
                console.log(send);
                port.write(send, function(err, bytesWritten) {
                    if (err) {
                        return console.log('Error: ', err.message);
                    }
                });
            });
            var requestData = function() {
                if (updatingFirmware || !connected)
                    return;
                var req = bufferToPacket(Cmd.PACKET_GET_DATA, Buffer.alloc(0));
                port.write(req, function(err, bytesWritten) {
                    if (err) {
                        return console.log('Error: ', err.message);
                    }
                    req = bufferToPacket(Cmd.PACKET_GET_CELLS, Buffer.alloc(0));
                    port.write(req, function(err, bytesWritten) {
                        if (err) {
                            return console.log('Error: ', err.message);
                        }
                    });
                });
            }
            var run = setInterval(requestData, 100);
            port.on('data', function(packet)
                    {
                        if (updatingFirmware || !connected)
                            return;
                        var data = processPacketData(packet);
                        if (data == [])
                            return;
                        if (data[0] == Cmd.PACKET_CONSOLE)
                        {
                            socket.emit('serial receive', hexString(data.slice(1)));
                        }
                        else if (data[0] == Cmd.PACKET_CONNECT)
                        {
                            socket.emit('fw version', hexString(data.slice(1)));
                        }
                        else if (data[0] == Cmd.PACKET_CONFIG_SET_FIELD)
                        {
                            var uint8 = new Uint8Array(data.slice(1));
                            var id = new DataView(uint8.buffer.slice(0, 2)).getUint16(0, false);
                            var type = Config.FieldToType[Config.IDToField[id]];
                            var value;
                            switch(type)
                            {
                                case "uint8":
                                    value = uint8[2];
                                    break;
                                case "uint16":
                                    var array = new DataView(uint8.buffer.slice(2)).getUint16(0, false);
                                    value = array[0];
                                    break;
                                case "uint32":
                                    var array = new DataView(uint8.buffer.slice(2)).getUint32(0, false);
                                    value = array[0];
                                    break;
                                case "float":
                                    var array = new DataView(uint8.buffer.slice(2)).getUint32(0, false);
                                    value = fb.fromUint(array).toFixed(2);
                                    break;
                            }
                            socket.emit('config change', {field: Config.IDToField[id], value: value});
                        }
                        else if (data[0] == Cmd.PACKET_GET_DATA)
                        {
                            //if (data.slice(1).length % 4 != 0)
                                //return;
                            var uint8 = new Uint8Array(data.slice(1));
                            var values = new DataView(uint8.buffer);
                            var voltage = fb.fromInt(values.getInt32(0, false)).toFixed(2);
                            var temp = fb.fromInt(values.getInt32(4, false)).toFixed(2);
                            var current = fb.fromInt(values.getInt32(8, false)).toFixed(2);
                            var chargeVoltage = fb.fromInt(values.getInt32(12, false)).toFixed(2);
                            var faults = values.getUint8(16);
                            var charging = values.getUint8(17) == 1 ? true : false;
                            //var state = uint8[5];
                            //var fault = uint8[7];
                            data = {current: current, charge_voltage: chargeVoltage};
                            socket.emit('graph', data);
                            socket.emit('voltage', voltage);
                            socket.emit('temperature', temp);
                            socket.emit('status_update', {charging: charging, fault: faults});
                        }
                        else if (data[0] == Cmd.PACKET_GET_CELLS)
                        {
                            //if (data.slice(2, -1).length % 4 != 0)
                                //return;
                            var numCells = data.slice(1).length / 4;
                            var uint8 = new Uint8Array(data.slice(1));
                            var values = new DataView(uint8.buffer);
                            data = [];
                            for (c = 0; c < numCells; c++)
                            {
                                data.push({x: c, y: fb.fromInt(values.getInt32(0, false)).toFixed(4)});
                            }
                            if (data.length > 0)
                                socket.emit('cells', data);
                        }
                        else if (data[0] == Cmd.PACKET_CONFIG_GET_ALL)
                        {
                            // In little endian, assumes configTable matches config struct in firmware
                            var configStruct = new Uint8Array(data.slice(1));
                            if (configStruct.length != configSize)
                                return;
                            var currIndex = 0;
                            for (j = 0; j < configTable.length; j++)
                            {
                                var value;
                                switch (configTable[j][1])
                                {
                                    case "uint8":
                                        value = configStruct[currIndex];
                                        break;
                                    case "uint16":
                                        value = new DataView(configStruct.buffer).getUint16(currIndex, true);
                                        break;
                                    case "uint32":
                                        value = new DataView(configStruct.buffer).getUint32(currIndex, true);
                                        break;
                                    case "float":
                                        value = fb.fromUint(new DataView(configStruct.buffer).getUint32(currIndex, true)).toFixed(2);
                                        break;
                                    case "bool":
                                        value = configStruct[currIndex] == 1 ? true : false;
                                        break;
                                }
                                socket.emit('config change', {field: configTable[j][0], value: value});
                                currIndex += configTable[j][2];
                            }
                        }
                    });
            var handshake = bufferToPacket(Cmd.PACKET_CONNECT, Buffer.alloc(0));
            port.write(handshake, function(err, bytesWritten) {
                if (err) {
                    return console.log('Error: ', err.message);
                }
                var config_req = bufferToPacket(Cmd.PACKET_CONFIG_GET_ALL, Buffer.alloc(0));
                port.write(config_req, function(err, bytesWritten) {
                    if (err) {
                        return console.log('Error: ', err.message);
                    }
                });
            });
            socket.emit('connect port');
            socket.on('disconnect', function()
                    {
                        port.close(function(err)
                                {
                                    connected = false;
                                });
                    });
            socket.on('disconnect port', function()
                    {
                        port.close(function(err)
                                {
                                    connected = false;
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
