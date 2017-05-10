var Accessory, PlatformAccessory, Service, Characteristic, UUIDGen, Factory;
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
    that.log(accessory.displayName + "* Identify!!!" );
    callback();
  });

  // update accessory names from the config:
  if (this.sensorNames[accessory.displayName]) {
     var displayName = this.sensorNames[accessory.displayName];
     this.log('Resetting saved name ' + accessory.displayName + ' -> ' + displayName );
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

  for (var i = this.accessories.length - 1; i--; ) {
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

MiJiaAccessoryFactory.prototype.setTemperatureAndHumidity = function(gatewaySid, deviceSid, temperature, humidity, battery, batteryLevel) {
  batteryLevel: 100,
  // Temperature
  isNaN(temperature) || this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Tem' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.TemperatureSensor,
    Characteristic.CurrentTemperature,
    temperature,
    null); // No commander
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Tem' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.BatteryService,
    Characteristic.StatusLowBattery,
    battery,
    null); // No commander
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Tem' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.BatteryService,
    Characteristic.BatteryLevel,
    batteryLevel, 
    null); // No commander

  // Humidity
  isNaN(humidity) || this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Hum' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.HumiditySensor,
    Characteristic.CurrentRelativeHumidity,
    humidity,
    null); // No commander
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Hum' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.BatteryService,
    Characteristic.StatusLowBattery,
    battery,
    null); // No commander
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Hum' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.BatteryService,
    Characteristic.BatteryLevel,
    batteryLevel, 
    null); // No commander
}

// Motion sensor
MiJiaAccessoryFactory.prototype.setMotion = function(gatewaySid, deviceSid, motionDetected, battery, batteryLevel) {
  batteryLevel: 100,
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Mot' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.MotionSensor,
    Characteristic.MotionDetected,
    motionDetected,
    null); // No commander
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Mot' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.BatteryService,
    Characteristic.StatusLowBattery,
    battery,
    null); // No commander
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Mot' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.BatteryService,
    Characteristic.BatteryLevel,
    batteryLevel, 
    null); // No commander
}

// Contact sensor
MiJiaAccessoryFactory.prototype.setContact = function(gatewaySid, deviceSid, contacted, battery, batteryLevel) {
  batteryLevel: 100,
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Mag' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.ContactSensor,
    Characteristic.ContactSensorState,
    contacted ? Characteristic.ContactSensorState.CONTACT_DETECTED : Characteristic.ContactSensorState.CONTACT_NOT_DETECTED,
    null); // No commander
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Mag' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.BatteryService,
    Characteristic.StatusLowBattery,
    battery,
    null); // No commander
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Mag' + deviceSid),
    Accessory.Categories.SENSOR,
    Service.BatteryService,
    Characteristic.BatteryLevel,
    batteryLevel, 
    null); // No commander
}

// Light switch
MiJiaAccessoryFactory.prototype.setLightSwitch = function(gatewaySid, deviceSid, uuidSeed, on, commander) {
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate(uuidSeed),
    this.config.fakeLightBulbForLightSwitch ? Accessory.Categories.LIGHTBULB : Accessory.Categories.SWITCH,
    this.config.fakeLightBulbForLightSwitch ? Service.Lightbulb : Service.Switch,
    Characteristic.On,
    on,
    commander);
}

// Plug
MiJiaAccessoryFactory.prototype.setPlugSwitch = function(gatewaySid, deviceSid, uuidSeed, on, commander) {
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate(uuidSeed),
    Accessory.Categories.OUTLET,
    Service.Outlet,
    Characteristic.On,
    on,
    commander);
}

// Wireless Switch is ProgrammableSwtich
MiJiaAccessoryFactory.prototype.setWirelessSwitch = function(gatewaySid, deviceSid, status, battery, batteryLevel) {
  batteryLevel: 100,
  this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Wireless Switch' + deviceSid),
    Accessory.Categories.PROGRAMMABLE_SWITCH,
    Service.StatelessProgrammableSwitch,
    Characteristic.ProgrammableSwitchEvent,
    status ? Characteristic.ProgrammableSwitchEvent.CLICK : Characteristic.ProgrammableSwitchEvent.DOUBLE_CLICK,
    null); // No commander

 this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Wireless Switch' + deviceSid),
    Accessory.Categories.PROGRAMMABLE_SWITCH,
    Service.BatteryService,
    Characteristic.StatusLowBattery,
    battery, 
    null); // No commander

 this.findServiceAndSetValue(
    gatewaySid,
    deviceSid,
    UUIDGen.generate('Wireless Switch' + deviceSid),
    Accessory.Categories.PROGRAMMABLE_SWITCH,
    Service.BatteryService,
    Characteristic.BatteryLevel,
    batteryLevel, 
    null); // No commander
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

MiJiaAccessoryFactory.prototype.findServiceAndSetValue = function(
  gatewaySid, deviceSid,
  accessoryUUID, accessoryCategory,
  serviceType,
  characteristicType, characteristicValue,
  commander) {
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
    newAccessory.getService(Service.AccessoryInformation)
    .setCharacteristic(Characteristic.Manufacturer, "MiJia")
    .setCharacteristic(Characteristic.Model, this.getAccessoryModel(serviceType))
    .setCharacteristic(Characteristic.SerialNumber, deviceSid);

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
