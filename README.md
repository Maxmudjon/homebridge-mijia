# homebridge-mijia
[![npm version](https://badge.fury.io/js/homebridge-mijia.svg)](https://badge.fury.io/js/homebridge-mijia)

MiJia plugin for [HomeBridge](https://github.com/nfarina/homebridge)

This repository contains the MiJia plugin for homebridge.

MiJia is a ZigBee gateway with a almost all sensors and accessories. Please see the pictures below.

![](https://raw.githubusercontent.com/Maxmudjon/images/master/Mijia-Gate-way-200x200.jpg)
![](https://raw.githubusercontent.com/Maxmudjon/images/master/Mijia-Honeywell-Smart-Fire-Alarm-200x200.jpg)
![](https://raw.githubusercontent.com/Maxmudjon/images/master/Mijia-Honeywell-Smart-Gas-Alarm-Detector-CH4-200x200.jpg)
![](https://raw.githubusercontent.com/Maxmudjon/images/master/Mijia-Light-Control-200x200.jpg)
![](https://raw.githubusercontent.com/Maxmudjon/images/master/Mijia-Light-Control-Slim-200x200.jpg)
![](https://raw.githubusercontent.com/Maxmudjon/images/master/Mijia-Body-Sensor-200x200.jpg)
![](https://raw.githubusercontent.com/Maxmudjon/images/master/Mijia-Door-Window-Sensor-200x200.jpg)
![](https://raw.githubusercontent.com/Maxmudjon/images/master/Mijia-Smart-Socket-200x200.jpg)
![](https://raw.githubusercontent.com/Maxmudjon/images/master/Mijia-Temperature-Humidity-Sensor-200x200.jpg)
![](https://raw.githubusercontent.com/Maxmudjon/images/master/Mijia-Wireless-Switch-200x200.jpg)

A new service has been added. Level battery.

<a href="url"><img src="https://raw.githubusercontent.com/Maxmudjon/images/master/photo_2017-05-07_01-12-01.jpg" align="left" height="320" width="180" ></a>
<a href="url"><img src="https://raw.githubusercontent.com/Maxmudjon/images/master/photo_2017-05-07_01-12-14.jpg" align="center" height="320" width="180" ></a>
<a href="url"><img src="https://raw.githubusercontent.com/Maxmudjon/images/master/photo_2017-05-07_01-12-17.jpg" align="right" height="320" width="180" ></a>


Adding a new low battery service. When the battery is low, the notification icon (iOS 10.3 or later version)

<a href="url"><img src="https://raw.githubusercontent.com/Maxmudjon/images/master/photo_2017-05-06_01-15-25.jpg" align="left" height="320" width="180" ></a>
<a href="url"><img src="https://raw.githubusercontent.com/Maxmudjon/images/master/photo_2017-05-06_01-15-39.jpg" align="center" height="320" width="180" ></a>


### Pre-Requirements
1. Make sure you have V2 of the gateway. V1 has limited space so can't support this feature.
2. Update gateway firmware to 1.4.1_141.0141 or later. You can contact [@babymoney666](https://github.com/babymoney666) if your firmware is not up to date.

### Installation
1. Install HomeBridge, please follow it's [README](https://github.com/nfarina/homebridge/blob/master/README.md). If you are using Raspberry Pi, please read [Running-HomeBridge-on-a-Raspberry-Pi](https://github.com/nfarina/homebridge/wiki/Running-HomeBridge-on-a-Raspberry-Pi).
2. Make sure you can see HomeBridge in your iOS devices, if not, please go back to step 1.
3. Download homebridge-mijia to your local folder.

### Configuration
1. Open MiJia gateway's settings, enable [local network protocol](https://github.com/louisZL/lumi-gateway-local-api). Please follow the steps in this thread: http://bbs.xiaomi.cn/t-13198850. It's in Chinese so you might need a translator to read it.
2. To control the devices, put gateway's MAC address (lower case without colon) and password to ~/.homebridge/config.json.


        {
            "platforms": [
            {
                "platform": "MiJiaPlatform",
                "sid": ["1a2b3c4d5e6f"],
                "password": ["1234567890123456"]
            }]
        }

 If you have more than one gateways, fill them in right order, like below.


        {
            "platforms": [
            {
                "platform": "MiJiaPlatform",
                "sid": ["1a2b3c4d5e6f", "1a2b3c4d5e6f", "1a2b3c4d5e6f"],
                "password": ["1234567890123456", "1234567890123456", "1234567890123456"]
            }]
        }

 If gateway's password is not set or not set right, you will see the following error in homebridge's output.


        > No password for gateway f0b429cbe4d3, please edit ~/.homebridge/config.json

 If you like to use Light Bulb type for Light Switch to make grandma Siri happy, like me, you can set the following in the config.


        {
            "platforms": [
            {
                "platform": "MiJiaPlatform",
                ...
                "fakeLightBulbForLightSwitch": true,
                ...
            }]
        }
        
 If you prefer to see sensor names instead of hex digis as name, add a mapping table to your config.json
 
        {
            "platforms": [
            {
                "platform": "MiJiaPlatform",
                ...
                "sensor_names": {
					"0c08":"Kitchen Window"
                }
                ...
            }]
        }   

### Run it
1. From source code


        $ cd /path/to/homebridge-mijia
        $ DEBUG=* homebridge -D -P .

2. As homebridge plugin


        $ npm install -g homebridge-mijia
        $ homebridge
