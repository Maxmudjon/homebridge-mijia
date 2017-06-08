var Accessory,
  PlatformAccessory,
  Service,
  Characteristic,
  UUIDGen,
  Factory;
var sensorNames;

module.exports = function(homebridge) {
  Accessory = homebridge.hap.Accessory;
  PlatformAccessory = homebridge.platformAccessory;

  // Service and Characteristic are from hap-nodejs
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  return MiJiaAccessoryFactory;
}

function MiJiaAccessoryFactory(log, config, api) {
  this.log = log;
  this.config = config;
  this.api = api;
  this.accessories = [];
  this.gatewaySids = {};
  this.lastGatewayUpdateTime = {};
  this.lastDeviceUpdateTime = {};

  this.sensorNames = {};
  if (config['sensor_names']) {
    this.sensorNames = config['sensor_names'];
  }
}

// Function invoked when homebridge tries to restore cached accessory
// Developer can configure accessory at here (like setup event handler)
// Update current value
MiJiaAccessoryFactory.prototype.configureAccessory = function(accessory) {
  var that = this;

  // set the accessory to reachable if plugin can currently process the accessory
  // otherwise set to false and update the reachability later by invoking
  // accessory.updateReachability()
  accessory.reachable = true;
  accessory.on('identify', function(paired, callback) {
    that.log(accessory.displayName + "* Identify!!!");
    callback();
  });

  // update accessory names from the config:
  if (this.sensorNames[accessory.displayName]) {
    var displayName = this.sensorNames[accessory.displayName];
    this.log('Resetting saved name ' + accessory.displayName + ' -> ' + displayName);
    accessory.displayName = displayName;
    var characteristic = service.getCharacteristic(Characteristic.Name);

    if (characteristic) {
      characteristic.updateValue(displayName);
    }
  }

  this.accessories.push(accessory);
  this.lastDeviceUpdateTime[accessory.UUID] = Date.now();
}

// How long in milliseconds we can remove an accessory when there's no update.
// This is a little complicated:
// First, we need to make sure gateway is online, if the gateway is offline, we do nothing.
// Then, we measure the delta since last update time, if it's too long, remove it.
const DeviceAutoRemoveDelta = 3600 * 1000;
const GatewayAutoRemoveDelta = 24 * 3600 * 1000;
MiJiaAccessoryFactory.prototype.autoRemoveAccessory = function() {
  var accessoriesToRemove = [];

  for (var i = this.accessories.length - 1; i--;) {
    var accessory = this.accessories[i];
    var gatewaySid = this.gatewaySids[accessory.UUID];
    var lastTime = this.lastDeviceUpdateTime[accessory.UUID];
    var removeFromGateway = gatewaySid && ((this.lastGatewayUpdateTime[gatewaySid] - lastTime) > DeviceAutoRemoveDelta);

    if (removeFromGateway || (Date.now() - lastTime) > GatewayAutoRemoveDelta) {
      this.log.debug("remove accessory %s", accessory.UUID);
      accessoriesToRemove.push(accessory);
      this.accessories.splice(i, 1);
    }
  }

  if (accessoriesToRemove.length > 0) {
    this.api.unregisterPlatformAccessories("homebridge-mijia", "MiJiaPlatform", accessoriesToRemove);
  }
}

MiJiaAccessoryFactory.prototype.updatelastDeviceUpdateTime = function(model, deviceSid) {
  switch (model) {
    case 'sensor_ht':
      this.lastDeviceUpdateTime[UUIDGen.generate('Tem' + deviceSid)] = Date.now();
      this.lastDeviceUpdateTime[UUIDGen.generate('Hum' + deviceSid)] = Date.now();
      break;
    case 'motion':
      this.lastDeviceUpdateTime[UUIDGen.generate('Mot' + deviceSid)] = Date.now();
      break;
    case 'magnet':
      this.lastDeviceUpdateTime[UUIDGen.generate('Mag' + deviceSid)] = Date.now();
      break;
    case 'ctrl_neutral1':
      this.lastDeviceUpdateTime[UUIDGen.generate('LW' + deviceSid)] = Date.now();
      break;
    case 'ctrl_neutral2':
      this.lastDeviceUpdateTime[UUIDGen.generate('LW0' + deviceSid)] = Date.now();
      this.lastDeviceUpdateTime[UUIDGen.generate('LW1' + deviceSid)] = Date.now();
      break;
    case '86sw1':
      this.lastDeviceUpdateTime[UUIDGen.generate('LW' + deviceSid)] = Date.now();
      break;
    case '86sw2':
      this.lastDeviceUpdateTime[UUIDGen.generate('LW0' + deviceSid)] = Date.now();
      this.lastDeviceUpdateTime[UUIDGen.generate('LW1' + deviceSid)] = Date.now();
      break;
    case 'plug':
      this.lastDeviceUpdateTime[UUIDGen.generate('PLUG' + deviceSid)] = Date.now();
      break;
    case 'switch':
      this.lastDeviceUpdateTime[UUIDGen.generate('Wireless Switch' + deviceSid)] = Date.now();
      break;
    default:
      this.log.debug('Could not update lastDeviceUpdateTime for deviceSid: \"%s\", because model \"%s\" is unknown\n', deviceSid, model);
  }
  this.log.debug('Updated lastDeviceUpdateTime for deviceSid: \"%s\", model: \"%s\"\n', deviceSid, model);
}

MiJiaAccessoryFactory.prototype.setTemperatureAndHumidity = function(gatewaySid, deviceSid, temperature, humidity, battery, batteryLevel) {
  var that = this;
  var temModelName = "Temperature Sensor";
  var accessoryTem = null;
  var accessoryTemUUID = UUIDGen.generate('Tem' + deviceSid);
  for (var index in this.accessories) {
    var a = this.accessories[index];
    if (a.UUID === accessoryTemUUID) {
      accessoryTem = a;
    }
  }

  var humModelName = "Humidity Sensor";
  var accessoryHum = null;
  var accessoryHumUUID = UUIDGen.generate('Hum' + deviceSid);
  for (var index in this.accessories) {
    var b = this.accessories[index];
    if (b.UUID === accessoryHumUUID) {
      accessoryHum = b;
    }
  }

  // Remember gateway/device update time
  this.lastGatewayUpdateTime[gatewaySid] = Date.now();
  this.lastDeviceUpdateTime[accessoryTemUUID] = Date.now();
  this.lastDeviceUpdateTime[accessoryHumUUID] = Date.now();
  this.gatewaySids[accessoryTemUUID] = gatewaySid;
  this.gatewaySids[accessoryHumUUID] = gatewaySid;

  // accessoryTem is new
  if (accessoryTem === null) {
    accessoryTem = new PlatformAccessory(temModelName, accessoryTemUUID, Accessory.Categories.SENSOR);
    accessoryTem.reachable = true;
    // Set serial number so we can track it later
    accessoryTem.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Xiaomi").setCharacteristic(Characteristic.Model, temModelName).setCharacteristic(Characteristic.SerialNumber, deviceSid);

    accessoryTem.addService(Service.TemperatureSensor, temModelName);
    accessoryTem.addService(Service.BatteryService);

    this.api.registerPlatformAccessories("homebridge-mijia", "MiJiaPlatform", [accessoryTem]);

    accessoryTem.on('identify', function(paired, callback) {
      that.log(accessoryTem.displayName, "Identify!!!");
      callback();
    });

    this.accessories.push(accessoryTem);
  }

  // accessoryHum is new
  if (accessoryHum === null) {
    accessoryHum = new PlatformAccessory(humModelName, accessoryHumUUID, Accessory.Categories.SENSOR);
    accessoryHum.reachable = true;
    // Set serial number so we can track it later
    accessoryHum.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Xiaomi").setCharacteristic(Characteristic.Model, humModelName).setCharacteristic(Characteristic.SerialNumber, deviceSid);

    accessoryHum.addService(Service.HumiditySensor, humModelName);
    accessoryHum.addService(Service.BatteryService);

    this.api.registerPlatformAccessories("homebridge-mijia", "MiJiaPlatform", [accessoryHum]);

    accessoryHum.on('identify', function(paired, callback) {
      that.log(accessoryHum.displayName, "Identify!!!");
      callback();
    });

    this.accessories.push(accessoryHum);
  }

  // accessoryTem not new
  accessoryTem.getService(Service.TemperatureSensor).updateCharacteristic(Characteristic.CurrentTemperature, temperature);
  accessoryTem.getService(Service.BatteryService).updateCharacteristic(Characteristic.StatusLowBattery, battery).updateCharacteristic(Characteristic.BatteryLevel, batteryLevel)

  accessoryHum.getService(Service.HumiditySensor).updateCharacteristic(Characteristic.CurrentRelativeHumidity, humidity);
  accessoryHum.getService(Service.BatteryService).updateCharacteristic(Characteristic.StatusLowBattery, battery).updateCharacteristic(Characteristic.BatteryLevel, batteryLevel)
}

// Motion sensor
MiJiaAccessoryFactory.prototype.setMotion = function(gatewaySid, deviceSid, motionDetected, battery, batteryLevel) {
  var that = this;
  var modelName = "Occupancy Sensor";
  var accessory = null;
  var accessoryUUID = UUIDGen.generate('Mot' + deviceSid);
  for (var index in this.accessories) {
    var a = this.accessories[index];
    if (a.UUID === accessoryUUID) {
      accessory = a;
    }
  }

  // Remember gateway/device update time
  this.lastGatewayUpdateTime[gatewaySid] = Date.now();
  this.lastDeviceUpdateTime[accessoryUUID] = Date.now();
  this.gatewaySids[accessoryUUID] = gatewaySid;

  // accessory is new
  if (accessory === null) {
    accessory = new PlatformAccessory(modelName, accessoryUUID, Accessory.Categories.SENSOR);
    accessory.reachable = true;
    // Set serial number so we can track it later
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Xiaomi").setCharacteristic(Characteristic.Model, modelName).setCharacteristic(Characteristic.SerialNumber, deviceSid);

    accessory.addService(Service.MotionSensor, modelName);
    accessory.addService(Service.BatteryService);

    this.api.registerPlatformAccessories("homebridge-mijia", "MiJiaPlatform", [accessory]);

    accessory.on('identify', function(paired, callback) {
      that.log(accessory.displayName, "Identify!!!");
      callback();
    });

    this.accessories.push(accessory);
  }

  // accessory not new
  accessory.getService(Service.MotionSensor).updateCharacteristic(Characteristic.MotionDetected, motionDetected);
  accessory.getService(Service.BatteryService).updateCharacteristic(Characteristic.StatusLowBattery, battery).updateCharacteristic(Characteristic.BatteryLevel, batteryLevel)
}

// Contact sensor
MiJiaAccessoryFactory.prototype.setContact = function(gatewaySid, deviceSid, contacted, battery, batteryLevel) {
  var that = this;
  var modelName = "Door/Window Sensor";
  var accessory = null;
  var accessoryUUID = UUIDGen.generate('Mag' + deviceSid);
  for (var index in this.accessories) {
    var a = this.accessories[index];
    if (a.UUID === accessoryUUID) {
      accessory = a;
    }
  }

  // Remember gateway/device update time
  this.lastGatewayUpdateTime[gatewaySid] = Date.now();
  this.lastDeviceUpdateTime[accessoryUUID] = Date.now();
  this.gatewaySids[accessoryUUID] = gatewaySid;

  // accessory is new
  if (accessory === null) {
    accessory = new PlatformAccessory(modelName, accessoryUUID, Accessory.Categories.SENSOR);
    accessory.reachable = true;
    // Set serial number so we can track it later
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Xiaomi").setCharacteristic(Characteristic.Model, modelName).setCharacteristic(Characteristic.SerialNumber, deviceSid);

    accessory.addService(Service.ContactSensor, modelName);
    accessory.addService(Service.BatteryService);

    this.api.registerPlatformAccessories("homebridge-mijia", "MiJiaPlatform", [accessory]);

    accessory.on('identify', function(paired, callback) {
      that.log(accessory.displayName, "Identify!!!");
      callback();
    });

    this.accessories.push(accessory);
  }

  // accessory not new
  accessory.getService(Service.ContactSensor).updateCharacteristic(Characteristic.ContactSensorState, contacted ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED);
  accessory.getService(Service.BatteryService).updateCharacteristic(Characteristic.StatusLowBattery, battery).updateCharacteristic(Characteristic.BatteryLevel, batteryLevel)
}

// Light switch
MiJiaAccessoryFactory.prototype.setLightSwitch = function(gatewaySid, deviceSid, uuidSeed, on, commander) {
this.findServiceAndSetValue(gatewaySid, deviceSid, UUIDGen.generate(uuidSeed), this.config.fakeLightBulbForLightSwitch
  ? Accessory.Categories.LIGHTBULB
  : Accessory.Categories.SWITCH, this.config.fakeLightBulbForLightSwitch
  ? Service.Lightbulb
  : Service.Switch, Characteristic.On, on, commander);
}

// Plug
MiJiaAccessoryFactory.prototype.setPlugSwitch = function(gatewaySid, deviceSid, uuidSeed, on, commander) {
this.findServiceAndSetValue(gatewaySid, deviceSid, UUIDGen.generate(uuidSeed), Accessory.Categories.OUTLET, Service.Outlet, Characteristic.On, on, commander);
}

MiJiaAccessoryFactory.prototype.setDuplexEightySixSwitch = function(gatewaySid, deviceSid, status, battery, batteryLevel) {
var that = this;
var modelName = "Double Light Switch Wireless"
var accessory = null;
var accessoryUUID = UUIDGen.generate('86sw2' + deviceSid);
for (var index in this.accessories) {
  var a = this.accessories[index];
  if (a.UUID === accessoryUUID) {
    accessory = a;
  }
}
// Remember gateway/device update time
this.lastGatewayUpdateTime[gatewaySid] = Date.now();
this.lastDeviceUpdateTime[accessoryUUID] = Date.now();
this.gatewaySids[accessoryUUID] = gatewaySid;

// accessory is new
if (accessory === null) {
  accessory = new PlatformAccessory(modelName, accessoryUUID, Accessory.Categories.PROGRAMMABLE_SWITCH);
  accessory.reachable = true;

  // Set serial number so we can track it later
  accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Xiaomi").setCharacteristic(Characteristic.Model, modelName).setCharacteristic(Characteristic.SerialNumber, deviceSid);
  // Set up 3 Buttons
  // Left button
  var serviceButton1 = new Service.StatelessProgrammableSwitch(modelName, "channel_0");
  // Right button
  var serviceButton2 = new Service.StatelessProgrammableSwitch(modelName, "channel_1");
  // Both button simultaneously
  var serviceButton3 = new Service.StatelessProgrammableSwitch(modelName, "dual_channel");
  // Buttons can only send single presses
  let props = {
    minValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
    maxValue: Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS,
    validValues: [Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS]
  };
  serviceButton1.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setProps(props);
  serviceButton1.getCharacteristic(Characteristic.LabelIndex).setValue(1);
  serviceButton2.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setProps(props);
  serviceButton2.getCharacteristic(Characteristic.LabelIndex).setValue(2);
  serviceButton3.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setProps(props);
  serviceButton3.getCharacteristic(Characteristic.LabelIndex).setValue(3);

  accessory.addService(serviceButton1);
  accessory.addService(serviceButton2);
  accessory.addService(serviceButton3);

  accessory.addService(Service.BatteryService);

  this.api.registerPlatformAccessories("homebridge-mijia", "MiJiaPlatform", [accessory]);

  accessory.on('identify', function(paired, callback) {
    that.log(accessory.displayName, "Identify!!!");
    callback();
  });

  this.accessories.push(accessory);
}
// accessory not new
if (status !== undefined) {
  // update Characteristic only if there is a button press (ignore read_ack)
  accessory.getServiceByUUIDAndSubType(deviceSid, status).updateCharacteristic(Characteristic.ProgrammableSwitchEvent, Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS);
}
accessory.getService(Service.BatteryService).updateCharacteristic(Characteristic.StatusLowBattery, battery).updateCharacteristic(Characteristic.BatteryLevel, batteryLevel)
}

// Wireless Switch is ProgrammableSwtich
MiJiaAccessoryFactory.prototype.setWirelessSwitch = function(gatewaySid, deviceSid, status, battery, batteryLevel) {
var that = this;
var modelName = "Wireless Switch";
var state = null;
switch (status) {
  case "click":
    state = Characteristic.ProgrammableSwitchEvent.SINGLE_PRESS;
    break;
  case "double_click":
    state = Characteristic.ProgrammableSwitchEvent.DOUBLE_PRESS;
    break;
  case "long_click_release":
    state = Characteristic.ProgrammableSwitchEvent.LONG_PRESS;
    break;
  default:
    break;
}

var accessory = null;
var accessoryUUID = UUIDGen.generate('Mot' + deviceSid);
for (var index in this.accessories) {
  var a = this.accessories[index];
  if (a.UUID === accessoryUUID) {
    accessory = a;
  }
}

// Remember gateway/device update time
this.lastGatewayUpdateTime[gatewaySid] = Date.now();
this.lastDeviceUpdateTime[accessoryUUID] = Date.now();
this.gatewaySids[accessoryUUID] = gatewaySid;

// accessory is new
if (accessory === null) {
  accessory = new PlatformAccessory(modelName, accessoryUUID, Accessory.Categories.PROGRAMMABLE_SWITCH);
  accessory.reachable = true;
  // Set serial number so we can track it later
  accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "Xiaomi").setCharacteristic(Characteristic.Model, modelName).setCharacteristic(Characteristic.SerialNumber, deviceSid);
  accessory.addService(new Service.StatelessProgrammableSwitch(modelName));
  accessory.addService(Service.BatteryService);

  this.api.registerPlatformAccessories("homebridge-mijia", "MiJiaPlatform", [accessory]);

  accessory.on('identify', function(paired, callback) {
    that.log(accessory.displayName, "Identify!!!");
    callback();
  });

  this.accessories.push(accessory);
}
// accessory not new
if (state !== null) {
  accessory.getService(Service.StatelessProgrammableSwitch).updateCharacteristic(Characteristic.ProgrammableSwitchEvent, state);
}
accessory.getService(Service.BatteryService).updateCharacteristic(Characteristic.StatusLowBattery, battery).updateCharacteristic(Characteristic.BatteryLevel, batteryLevel)
}

MiJiaAccessoryFactory.prototype.getAccessoryModel = function(type) {
switch (type) {
  case Service.Lightbulb:
    return "Light Switch";
  case Service.Outlet:
    return "Plug Switch";
  case Service.TemperatureSensor:
    return "Temperature Sensor";
  case Service.HumiditySensor:
    return "Humidity Sensor";
  case Service.ContactSensor:
  case Service.Door:
  case Service.Window:
    return "Contact Sensor";
  case Service.MotionSensor:
    return "Motion Sensor";
  case Service.StatelessProgrammableSwitch:
    return "Wireless Switch";
  default:
    return "Unknown";
}
}

MiJiaAccessoryFactory.prototype.findServiceAndSetValue = function(gatewaySid, deviceSid, accessoryUUID, accessoryCategory, serviceType, characteristicType, characteristicValue, commander) {
// Use last four characters of deviceSid as service name
var accessoryName = deviceSid.substring(deviceSid.length - 4);
if (this.sensorNames[accessoryName]) {
  var displayName = this.sensorNames[accessoryName];
  accessoryName = displayName;
}
var serviceName = accessoryName;

// Remember gateway/device update time
this.lastGatewayUpdateTime[gatewaySid] = Date.now();
this.lastDeviceUpdateTime[accessoryUUID] = Date.now();
this.gatewaySids[accessoryUUID] = gatewaySid;

var that = this;
var newAccessory = null;
var service = null;

for (var index in this.accessories) {
  var accessory = this.accessories[index];
  if (accessory.UUID === accessoryUUID) {
    newAccessory = accessory;
  }
}

if (!newAccessory) {
  newAccessory = new PlatformAccessory(accessoryName, accessoryUUID, accessoryCategory);
  newAccessory.reachable = true;

  // Set serial number so we can track it later
  newAccessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, "MiJia").setCharacteristic(Characteristic.Model, this.getAccessoryModel(serviceType)).setCharacteristic(Characteristic.SerialNumber, deviceSid);

  service = newAccessory.addService(serviceType, serviceName);
  this.api.registerPlatformAccessories("homebridge-mijia", "MiJiaPlatform", [newAccessory]);
  newAccessory.on('identify', function(paired, callback) {
    that.log(newAccessory.displayName, "Identify!!!");
    callback();
  });

  this.accessories.push(newAccessory);
} else {
  service = newAccessory.getService(serviceType);
}

if (!service) {
  service = newAccessory.addService(serviceType, serviceName);
}

var characteristic = service.getCharacteristic(characteristicType);

if (characteristic) {
  characteristic.updateValue(characteristicValue);

  // Send command back once value is changed
  if (commander && (characteristic.listeners('set').length == 0)) {
    characteristic.on("set", function(value, callback) {
      commander.send(value);
      callback();
    });
  }
} else {
  that.log("Service not found");
}
}
