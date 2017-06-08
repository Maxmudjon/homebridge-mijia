const dgram = require('dgram');
const inherits = require('util').inherits;
const crypto = require('crypto');
const iv = Buffer.from([0x17, 0x99, 0x6d, 0x09, 0x3d, 0x28, 0xdd, 0xb3, 0xba, 0x69, 0x5a, 0x2e, 0x6f, 0x58, 0x56, 0x2e]);
const serverSocket = dgram.createSocket({
  type: 'udp4',
  reuseAddr: true
});
const multicastAddress = '224.0.0.50';
const multicastPort = 4321;
const serverPort = 9898;
var MiJiaAccessoryFactory;
var fs = require('fs');
module.exports = function(homebridge) {
   MiJiaAccessoryFactory = require('./MiJiaAccessoryFactory')(homebridge);

   // Register
   homebridge.registerPlatform("homebridge-mijia", "MiJiaPlatform", MiJiaPlatform, true);
}

// Platform constructor
// config may be null
// api may be null if launched from old homebridge version
function MiJiaPlatform(log, config, api) {
  // Initialize
  this.log = log;
  this.factory = new MiJiaAccessoryFactory(log, config, api);
  this.parsers = {
    'sensor_ht' : new TemperatureAndHumidityParser(this),
    'motion' : new MotionParser(this),
    'magnet' : new ContactParser(this),
    'ctrl_neutral1' : new LightSwitchParser(this),
    'ctrl_neutral2' : new DuplexLightSwitchParser(this),
    '86sw1' : new EightySixSwitchParser(this),
    '86sw2' : new DuplexEightySixSwitchParser(this),
    'plug' : new PlugSwitchParser(this),
    'switch' : new WirelessSwitchParser(this)
  };

  // A lookup table to get cipher password from gateway/device sid.
  this.passwords = {};

  // A lookup table to find gateway sid from a device sid.
  // This is used when we sending a command to the gateway.
  this.gatewaySids = {};

  // A lookup table to get token from a gateway sid.
  this.gatewayTokens = {};

  // To get gateway's address from a device sid.
  this.gatewayAddress = {};

  // To get gateways' port from a device sid.
  this.gatewayPort = {};

  //Battery
  this.batteryVoltages = {};

  // Load passwords from config.json
  this.loadConfig(config);

  // Start UDP server to communicate with MiJia gateways
  this.startServer();

  // Something else to do
  this.doRestThings(api);
}

MiJiaPlatform.prototype.loadConfig = function(config) {
  // Load cipher password for each gateway from HomeBridge's config.json
  var sid = config['sid'];
  var password = config['password'];
  if (sid.length !== password.length) {
    throw new Error('Number of SIDs must equal to the one of passwords.');
  }
  this.passwords = password.reduce(function (passwords, password, index) {
    passwords[sid[index]] = password;
    return passwords;
  }, {});

  this.sensorNames = config['sensor_names'];
}

MiJiaPlatform.prototype.doRestThings = function(api) {
  if (api) {
    // Save the API object as plugin needs to register new accessory via this object.
    this.api = api;

    this.api.on('didFinishLaunching', function() {
        // Send whois to discovery MiJia gateways and resend every 300 seconds
        var whoisCommand = '{"cmd": "whois"}';
        serverSocket.send(whoisCommand, 0, whoisCommand.length, multicastPort, multicastAddress);

        setInterval(function() {
          serverSocket.send(whoisCommand, 0, whoisCommand.length, multicastPort, multicastAddress);
        }, 300000);
    });

    var factory = this.factory;
    // Check removed accessory every half hour.
    setInterval(function(){
      factory.autoRemoveAccessory();
    }, 1800000);
  } else {
    this.log.error("Homebridge's version is too old, please upgrade!");
  }
}

MiJiaPlatform.prototype.startServer = function() {
  var that = this;

  // Initialize a server socket for MiJia gateways.
  serverSocket.on('message', this.parseMessage.bind(this));

  // err - Error object, https://nodejs.org/api/errors.html
  serverSocket.on('error', function(err){
    that.log.error('error, msg - %s, stack - %s\n', err.message, err.stack);
  });

  // Show some message
  serverSocket.on('listening', function(){
    that.log.debug("MiJia server is listening on port 9898.");
    serverSocket.addMembership(multicastAddress);
  });

  // Start server
  serverSocket.bind(serverPort);
}

// Parse message which is sent from MiJia gateways
MiJiaPlatform.prototype.parseMessage = function(msg, rinfo){
  var platform = this;
  platform.log.debug('recv %s(%d bytes) from client %s:%d\n', msg, msg.length, rinfo.address, rinfo.port);
  var json;
  try {
    json = JSON.parse(msg);
  } catch (ex) {
    platform.log.error("Bad json %s", msg);
    return;
  }

  var cmd = json['cmd'];
  if (cmd === 'iam') {
    var address = json['ip'];
    var port = json['port'];
    var response = '{"cmd":"get_id_list"}';
    serverSocket.send(response, 0, response.length, port, address);
  } else if (cmd === 'get_id_list_ack') {
    var gatewaySid = json['sid'];
    var gatewayToken = json['token'];

    // Remember gateway's token
    this.gatewayTokens[gatewaySid] = gatewayToken;

    var data = JSON.parse(json['data']);
    for(var index in data) {
      var deviceSid = data[index];

      // Remember the device/gateway relation
      this.gatewaySids[deviceSid] = gatewaySid;
      this.gatewayAddress[deviceSid] = rinfo.address;
      this.gatewayPort[deviceSid] = rinfo.port;

      var response = '{"cmd":"read", "sid":"' + deviceSid + '"}';
      serverSocket.send(response, 0, response.length, rinfo.port, rinfo.address);
    }
  } else if (cmd === 'heartbeat') {
    var model = json['model'];
    if (model === 'gateway') {
      var gatewaySid = json['sid'];
      var gatewayToken = json['token'];
      // Remember gateway's token
      this.gatewayTokens[gatewaySid] = gatewayToken;
    }
  } else if (cmd === 'write_ack') {
  } else {
    var id = json['sid'];
    var model = json['model'];

  	var data = JSON.parse(json['data']);
    if ('voltage' in data) {
      var battery2 = data['voltage'];
      // Remember device battery voltage
      this.batteryVoltages[id] = battery2;
    }

    // Update lastDeviceUpdateTime when device sends read_ack
    // needed only for older devices
    this.factory.updatelastDeviceUpdateTime(model, id);

    if (model in this.parsers) {
      this.parsers[model].parse(json, rinfo);
    }
  }
}

// Function invoked when homebridge tries to restore cached accessory
// Developer can configure accessory at here (like setup event handler)
// Update current value
MiJiaPlatform.prototype.configureAccessory = function(accessory) {
  this.factory.configureAccessory(accessory);
}

// Base parser
BaseParser = function() {
  this.platform = null;
}

BaseParser.prototype.init = function(platform) {
  this.platform = platform;
  this.factory = platform.factory;
}

// Tmeperature and humidity sensor data parser
TemperatureAndHumidityParser = function(platform) {
  this.init(platform);
}

inherits(TemperatureAndHumidityParser, BaseParser);

TemperatureAndHumidityParser.prototype.parse = function(report) {
  var deviceSid = report['sid'];
  var gatewaySid = this.platform.gatewaySids[deviceSid];
  var battery = this.platform.batteryVoltages[deviceSid];
  var data = JSON.parse(report['data']);

  var temperature = data['temperature'] / 100.0;
  var humidity = data['humidity'] / 100.0;
  battery1: 0;
  if (battery >= 2801){
  	battery1 = 0;
  	battery2 = ((battery-2800)/5);
  } else {
  	battery1 = 1;
  };

  this.factory.setTemperatureAndHumidity(gatewaySid, deviceSid, temperature, humidity, battery1, battery2);
}

// Motion sensor data parser
MotionParser = function(platform) {
  this.init(platform);
}

inherits(MotionParser, BaseParser);

MotionParser.prototype.parse = function(report, rinfo) {
  var deviceSid = report['sid'];
  var gatewaySid = this.platform.gatewaySids[deviceSid];
  var battery = this.platform.batteryVoltages[deviceSid];
  var data = JSON.parse(report['data']);
  var motionDetected = (data['status'] === 'motion');
  battery1: 0;
  if (battery >= 2801){
  	battery1 = 0;
  	battery2 = ((battery-2800)/5);
  } else {
  	battery1 = 1;
  }
  this.factory.setMotion(gatewaySid, deviceSid, motionDetected, battery1, battery2);
}


// Contact/Magnet sensor data parser
ContactParser = function(platform) {
  this.init(platform);
}

inherits(ContactParser, BaseParser);

ContactParser.prototype.parse = function(report, rinfo) {
  var deviceSid = report['sid'];
  var gatewaySid = this.platform.gatewaySids[deviceSid];
  var battery = this.platform.batteryVoltages[deviceSid];
  var data = JSON.parse(report['data']);
  var contacted = (data['status'] === 'close');
  battery1: 0;
  if (battery >= 2801){
  	battery1 = 0;
  	battery2 = ((battery-2800)/5);
  } else {
  	battery1 = 1;
  }
  this.factory.setContact(gatewaySid, deviceSid, contacted, battery1, battery2);
}

// Light switch data parser
LightSwitchParser = function(platform) {
  this.init(platform);
  this.commanders = {};
}

inherits(LightSwitchParser, BaseParser);

LightSwitchParser.prototype.parse = function(report, rinfo) {
  var deviceSid = report['sid'];
  var gatewaySid = this.platform.gatewaySids[deviceSid];
  var data = JSON.parse(report['data']);

  // channel_0 can be three states: on, off, unknown.
  // we can't do anything when state is unknown, so just ignore it.
  if (data['channel_0'] === 'unknown') {
    this.platform.log.warn("warn %s(sid:%s):channel_0's state is unknown, ignore it.", report['model'], deviceSid);;
  } else {
    var on = (data['channel_0'] === 'on');
    var commander;

    if (deviceSid in this.commanders) {
      commander = this.commanders[deviceSid];
    } else {
      commander = new LightSwitchCommander(this.platform, deviceSid, report['model'], 'channel_0');
      this.commanders[deviceSid] = commander;
    }

    commander.update(on);
    this.factory.setLightSwitch(gatewaySid, deviceSid, 'LW' + deviceSid, on, commander);
  }
}

// Duplex light switch data parser
DuplexLightSwitchParser = function(platform) {
  this.init(platform);
  this.commanders0 = {};
  this.commanders1 = {};
}

inherits(DuplexLightSwitchParser, BaseParser);

DuplexLightSwitchParser.prototype.parse = function(report, rinfo) {
  var deviceSid = report['sid'];
  var gatewaySid = this.platform.gatewaySids[deviceSid];
  var data = JSON.parse(report['data']);
  var switchNames = ['channel_0', 'channel_1'];
  var uuidPrefix = ['LW0', 'LW1'];
  var commanders = [this.commanders0, this.commanders1];

  for (var index in switchNames) {
    var switchName = switchNames[index];
    if (switchName in data) {
      // There are three states: on, off, unknown.
      // We can't do anything when state is unknown, so just ignore it.
      if (data[switchName] === 'unknown') {
        this.platform.log.warn("warn %s(sid:%s):%s's state is unknown, ignore it.", report['model'], deviceSid, switchName);
      } else {
        var on = (data[switchName] === 'on');
        var commander = this.parseInternal(deviceSid, commanders[index], report['model'], switchName, rinfo, on);
        this.factory.setLightSwitch(gatewaySid, deviceSid, uuidPrefix[index] + deviceSid, on, commander);
      }
    }
  }
}

DuplexLightSwitchParser.prototype.parseInternal = function(deviceSid, commanders, deviceModel, switchName, rinfo, on) {
  var commander;

  if (deviceSid in commanders) {
    commander = commanders[deviceSid];
  } else {
    commander = new LightSwitchCommander(this.platform, deviceSid, deviceModel, switchName);
    commanders[deviceSid] = commander;
  }

  commander.update(on);

  return commander;
}



// 86 switch data parser
EightySixSwitchParser = function(platform) {
  this.init(platform);
  this.commanders = {};
}

inherits(EightySixSwitchParser, BaseParser);

EightySixSwitchParser.prototype.parse = function(report, rinfo) {
  var deviceSid = report['sid'];
  var gatewaySid = this.platform.gatewaySids[deviceSid];
  var data = JSON.parse(report['data']);

  // channel_0 can be two states: click, double_click
  if (data['channel_0'] === 'unknown') {
    this.platform.log.warn("warn %s(sid:%s):channel_0's state is unknown, ignore it.", report['model'], deviceSid);;
  } else {
    var commander;

    if (deviceSid in this.commanders) {
      commander = this.commanders[deviceSid];
    } else {
      commander = new LightSwitchCommander(this.platform, deviceSid, report['model'], 'channel_0');
      this.commanders[deviceSid] = commander;
    }

    commander.toggleValue();
    this.factory.setLightSwitch(gatewaySid, deviceSid, 'LW' + deviceSid, commander.getLastValue(), commander);
  }
}



// Duplex light switch data parser
DuplexEightySixSwitchParser = function(platform) {
  this.init(platform);
  // this.commanders0 = {};
  // this.commanders1 = {};
}

inherits(DuplexEightySixSwitchParser, BaseParser);

DuplexEightySixSwitchParser.prototype.parse = function(report, rinfo) {
  var deviceSid = report['sid'];
  var gatewaySid = this.platform.gatewaySids[deviceSid];
  var battery = this.platform.batteryVoltages[deviceSid];
  var data = JSON.parse(report['data']);
  var status;
  if ('channel_0' in data) {
    status = "channel_0";
  } else if ('channel_1' in data) {
    status = "channel_1";
  } else if ('dual_channel' in data) {
    status = "dual_channel";
  }

  battery1: 0;
  if (battery >= 2801){
  	battery1 = 0;
  	battery2 = ((battery-2800)/5);
  } else {
  	battery1 = 1;
  }

  this.factory.setDuplexEightySixSwitch(gatewaySid, deviceSid, status, battery1, battery2);

  // for (var index in switchNames) {
  //   var switchName = switchNames[index];
  //   if (switchName in data) {
  //     // There are three states: on, off, unknown.
  //     // We can't do anything when state is unknown, so just ignore it.
  //     if (data[switchName] === 'unknown') {
  //       this.platform.log.warn("warn %s(sid:%s):%s's state is unknown, ignore it.", report['model'], deviceSid, switchName);
  //     } else {
  //       var commander = this.parseInternal(deviceSid, commanders[index], report['model'], switchName, rinfo);
  //       this.factory.setLightSwitch(gatewaySid, deviceSid, uuidPrefix[index] + deviceSid, commander.getLastValue(), commander);
  //     }
  //   }
  // }
}

// DuplexEightySixSwitchParser.prototype.parseInternal = function(deviceSid, commanders, deviceModel, switchName, rinfo) {
//   var commander;
//
//   if (deviceSid in commanders) {
//     commander = commanders[deviceSid];
//   } else {
//     commander = new LightSwitchCommander(this.platform, deviceSid, deviceModel, switchName);
//     commanders[deviceSid] = commander;
//   }
//
//   commander.toggleValue();
//
//   return commander;
// }

// Wireless Switch data parser
WirelessSwitchParser = function(platform) {
  this.init(platform);
}

inherits(WirelessSwitchParser, BaseParser);

WirelessSwitchParser.prototype.parse = function(report, rinfo) {
  var deviceSid = report['sid'];
  var gatewaySid = this.platform.gatewaySids[deviceSid];
  var battery = this.platform.batteryVoltages[deviceSid];
  var data = JSON.parse(report['data']);
  var status = data['status'];

  battery1: 0;
  if (battery >= 2801){
  	battery1 = 0;
  	battery2 = ((battery-2800)/5);
  } else {
  	battery1 = 1;
  }

  this.factory.setWirelessSwitch(gatewaySid, deviceSid, status, battery1, battery2);
}

// Plug data parser
PlugSwitchParser = function(platform) {
  this.init(platform);
  this.commanders = {};
}

inherits(PlugSwitchParser, BaseParser);

PlugSwitchParser.prototype.parse = function(report, rinfo) {
  var deviceSid = report['sid'];
  var gatewaySid = this.platform.gatewaySids[deviceSid];
  var data = JSON.parse(report['data']);

  // channel_0 can be three states: on, off, unknown.
  // we can't do anything when state is unknown, so just ignore it.
  if (data['status'] === 'unknown') {
    this.platform.log.warn("warn %s(sid:%s):status's state is unknown, ignore it.", report['model'], deviceSid);
  } else {
    var on = (data['status'] === 'on');
    var commander;

    if (deviceSid in this.commanders) {
      commander = this.commanders[deviceSid];
    } else {
      commander = new LightSwitchCommander(this.platform, deviceSid, report['model'], 'status');
      this.commanders[deviceSid] = commander;
    }

    commander.update(on);
    this.factory.setPlugSwitch(gatewaySid, deviceSid, 'PLUG' + deviceSid, on, commander);
  }
}




// Base commander
BaseCommander = function() {
  this.lastValue = null;
}

BaseCommander.prototype.init = function(platform, deviceSid, deviceModel) {
  this.platform = platform;
  this.deviceModel = deviceModel;
  this.deviceSid = deviceSid;
}

BaseCommander.prototype.update = function(value) {
  this.lastValue = value;
}

BaseCommander.prototype.getLastValue = function() {
  return this.lastValue;
}

BaseCommander.prototype.sendCommand = function(command) {
  var remoteAddress = this.platform.gatewayAddress[this.deviceSid];
  var remotePort = this.platform.gatewayPort[this.deviceSid];
  serverSocket.send(command, 0, command.length, remotePort, remoteAddress);
  // this.platform.log.debug("send %s to %s:%d", command, remoteAddress, remotePort);
  // Send twice to reduce UDP packet loss
  // serverSocket.send(command, 0, command.length, remotePort, remoteAddress);
}

// Commander for light switch
LightSwitchCommander = function(platform, deviceSid, deviceModel, switchName) {
  this.init(platform, deviceSid, deviceModel);
  this.switchName = switchName;
}

inherits(LightSwitchCommander, BaseCommander);

LightSwitchCommander.prototype.toggleValue = function() {
  this.lastValue = !this.lastValue;
}

LightSwitchCommander.prototype.send = function(on) {
  var platform = this.platform;

  // Dont' send duplicate command out.
  if (this.lastValue == on) {
    platform.log.debug("Value not changed, do nothing");
    return;
  }

  var gatewaySid = platform.gatewaySids[this.deviceSid];
  var password = platform.passwords[gatewaySid];

  // No password for this device, please edit ~/.homebridge/config.json
  if (!password) {
    platform.log.error("No password for gateway %s, please edit ~/.homebridge/config.json", gatewaySid);
    return;
  }

  var cipher = crypto.createCipheriv('aes-128-cbc', password, iv);
  var gatewayToken = platform.gatewayTokens[gatewaySid];

  var key = "hello";
  if (cipher && gatewayToken) {
    key = cipher.update(gatewayToken, "ascii", "hex");
    cipher.final('hex'); // Useless data, don't know why yet.
  }

  var command = '{"cmd":"write","model":"' + this.deviceModel + '","sid":"' + this.deviceSid + '","data":"{\\"' + this.switchName + '\\":\\"' + (on ? 'on' : 'off') + '\\", \\"key\\": \\"' + key + '\\"}"}';
  this.sendCommand(command);
}
