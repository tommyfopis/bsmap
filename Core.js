/*
 Core.js - part of bsmap

 Copyright (c) 2016 by Konstantin Kushnir <chpock@gmail.com>

 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.

 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU General Public License for more details.

 You should have received a copy of the GNU General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/
/* jslint browser:true */
// disable error in "use strict"; function
/* jslint node:true,sub:true */
/*globals App,noty,google,jcE,L,$ */
"use strict";

App.Core = function (){
  var center, zoom;
  $('#map')[0].removeChild($('.cssload-loader')[0]);
  $('#map')[0].style['background-image'] = 'url(images/background.png)';

  this.layers = {
    'OpenStreetMap': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    })
  };

/* Stamen Toner tiles is not https :(
    'Stamen Toner': L.tileLayer('http://{s}.tile.stamen.com/toner/{z}/{x}/{y}.png', {
      attribution: 'Map tiles by <a href="http://stamen.com">Stamen Design</a>, <a href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a> &mdash; Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> contributors, <a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>',
      subdomains: 'abcd',
      minZoom: 0,
      maxZoom: 20
    }) */

  if ($.localStorage.isSet('map') && !$.localStorage.isEmpty('map')) {
    try {
      center = $.localStorage.get('map')['center'];
      zoom = $.localStorage.get('map')['zoom'];
    } catch (err) {
      console.log('error while setting map view:');
      console.log(err);
      center = null;
      zoom = null;
    }
  }

  if (!center) {
    $.getJSON("http://ip-api.com/json/?callback=?", (function(self){
      return function(data) {
        if (data && data.lat && data.lon && self.map) self.map.flyTo([data.lat, data.lon]);
      };
    })(this));
    center = new L.LatLng(50.4501, 30.5234);
  }
  zoom = zoom || 11;

  this.map = new L.Map('map', {
    center: center,
    zoom: zoom,
    zoomControl: false
  })
    .on({
      load: this.autocompleteBound,
      viewreset: this.autocompleteBound,
      dragend: this.autocompleteBound,
      zoomend: this.autocompleteBound,
      zoomlevelschange: this.autocompleteBound,
      resize: this.autocompleteBound,
      click: this.delayExecFunc('buildbs', this.buildBS_onClick, 250, this),
      dblclick: this.cancelExecFunc('buildbs')
    }, this)
    .addLayer(this.layers['OpenStreetMap'])
    .addControl(new L.Control.Zoom({ position: "bottomleft" }));

  this.map_control_layers = new L.Control.Layers(this.layers);
  this.map.addControl(this.map_control_layers);

  this.panel = new L.Control.Panel();
  this.map.addControl(this.panel);

  this.collection = {};

  this.collection.address = new this.App.Collection({
    map: this.map,
    sidebar: $('#tbl_address')[0],
    save_id: 'tbl_address',
    objects: this.App.Address
  }).loadFromStorage();

  this.collection.bs = new this.App.Collection({
    map: this.map,
    sidebar: $('#tbl_bs')[0],
    save_id: 'tbl_bs',
    objects: this.App.BS
  }).loadFromStorage();

  this.collection.region = new this.App.Collection({
    map: this.map,
    sidebar: $('#tbl_region')[0],
    save_id: 'tbl_region',
    objects: this.App.Region
  }).loadFromStorage();

  this.collection.save = new this.App.CollectionSaves({
    map: this.map,
    sidebar: $('#tbl_save')[0],
    save_id: 'tbl_save',
    objects: this.App.Saves
  }).loadFromStorage();

  L.DomEvent.addListener($('#new-button')[0], 'click', function(){
    noty({
      text: 'Вы действительно хотите очистить карту?',
      type: 'confirm',
      timeout: false,
      layout: 'center',
      theme: 'bsmap',
      modal: true,
      buttons: [
        {
          addClass: 'btn btn-primary',
          text: 'Очистить',
          onClick: (function(self){
            return function($noty) {
              $noty.close();
              for (var k in self.collection) {
                if (self.collection.hasOwnProperty(k) && k !== 'save')
                  self.collection[k].emptify();
              }
              self.collection.save.currentReset();
            };
          })(this)
        },{
          addClass: 'btn btn-danger',
          text: 'Отмена',
          onClick: function($noty) {
            $noty.close();
          }
        }
      ]
    });
  }, this);

  L.DomEvent.addListener($('#save-button')[0], 'click', function(){
    var save = this.collection.save.currentGet();
    if (!save) return;
    save.getCurrentMapState();
    save.redrawSidebar();
    noty({
      text: 'Карта "' + this.escapeHTML(save.options.title) + '" успешно сохранена.',
      type: 'success',
      timeout: 2000,
      layout: 'bottomCenter'
    });
  }, this);

  L.DomEvent.addListener($('#saveas-button')[0], 'click', function(){
    if (L.DomUtil.hasClass(this, 'save-button-disabled')) return;
    $('.save-dialog').slideDown(300);
    L.DomUtil.addClass(this, 'save-button-disabled');
  }, $('#saveas-button')[0]);

  L.DomEvent.addListener($('#save-dialog-button-cancel')[0], 'click', function(){
    $('.save-dialog').slideUp(300);
    L.DomUtil.removeClass($('#saveas-button')[0], 'save-button-disabled');
  }, this);

  L.DomEvent.addListener($('#save-dialog-button-ok')[0], 'click', function(){
    var title = String($('#save-dialog-input-title').val()).trim();
    if (title === '') {
      noty({
        text: 'Невозможно сохранить состояние карты с пустым именем.',
        type: 'error',
        timeout: 5000,
        layout: 'bottom',
        theme: 'bsmap'
      });
      $('#save-dialog-input-title').focus();
      return;
    }

    var save = this.collection.save.new({
      title: title,
      current: true
    });
    this.collection.save.currentUpdate(save);

    $('#save-button').click();

    $('#save-dialog-input-title').val('');
    $('#save-dialog-button-cancel').click();
  }, this);

  this.moduleEvent('Leaflet-Google', this.initGoogle, this);
};

App.extend(App.Core, {
  initGoogle: function(){
    var self = this;

    this.map_control_layers.addBaseLayer(new L.Google('ROADMAP'), 'Google');

    this.map.getBoundsGoogle = function () {
       var bounds = this.getBounds();
       return new google.maps.LatLngBounds(
        new google.maps.LatLng(bounds['_southWest']['lat'],bounds['_southWest']['lng']),
        new google.maps.LatLng(bounds['_northEast']['lat'],bounds['_northEast']['lng'])
      );
    };

    this.autocomplete = new google.maps.places.Autocomplete(this.panel.input_address, {
      types: ['geocode'],
      componentRestrictions: {country: 'ua'}
    });
    this.autocomplete.setBounds(this.map.getBoundsGoogle());

    google.maps.event.addListener(this.autocomplete, 'place_changed', function(){
      self.autocompleteChange.call(self);
    });

    this.geocoder = new google.maps.Geocoder();
    this.autocomplete_service = new google.maps.places.AutocompleteService();

    L.DomEvent.addListener(this.panel.input_address, 'keyup', function(ev){
      if (ev.keyCode !== 13) return;
      L.DomEvent.stop(ev);
      var address = this.panel.input_address.value.trim();
      if (address === '') return;
      this.autocomplete_service.getPlacePredictions({
        input: address,
        bounds: this.autocomplete.getBounds(),
        componentRestrictions: {
          country: 'ua'
        },
        types: ['geocode']
      }, function(result, status) {
        if (status !== 'OK') {
          console.log('Error while req autocompl service. Status: "' + status + '"', arguments);
        } else if (!result.length) {
          console.log('Error while req autocompl service. Result is empty.', arguments);
        } else if (!result[0].place_id) {
          console.log('Error while req autocompl service. "place_id" not found.', arguments);
        } else {
          self.geocoder.geocode({
            placeId: result[0].place_id
          }, function (result, status) {
            if (status !== 'OK') {
              console.log('Error while req geocode. Status: "' + status + '"', arguments);
            } else if (!result.length) {
              console.log('Error while req geocode. Result is empty', arguments);
            } else if (!result[0].geometry || !result[0].geometry.location) {
              console.log('Error while req geocode. geometry.location in place[0] not found', arguments);
            } else {
              L.DomUtil.removeClass(self.panel.input_address, 'address-notfound');
              self.buildPlace(result[0]);
            }
          });
        }
      });
    }, this);
  },
  autocompleteBound: function(){
    if (this.map) {
      $.localStorage.set('map', {
        center: this.map.getCenter(),
        zoom: this.map.getZoom()
      });
    }
    if (!this.autocomplete) return;
    this.autocomplete.setBounds(this.map.getBoundsGoogle());
  },
  buildBS_onClick: function (ev) {
    if (this.panel.current_button !== 1) return;
    var azimuth = this.buildBS_checkAzimuth(this.panel.input_value_azimut);
    if (azimuth === -1) {
      $('.tab-panel .tab-panel-input-azimut').focus();
      return;
    }
    this.buildBS(ev.latlng, azimuth, this.panel.colorpicker_bs.getColor());
  },
  buildBS_checkAzimuth: function (value) {
    value = parseInt(value,10);
    if (isNaN(value) || value < 0 || value > 360) {
      noty({
        text: 'Невозможно построить БС: некорректное значение азимута. Значение азимута должно быть от 0° до 360°.',
        type: 'error',
        timeout: 5000,
        layout: 'bottom',
        theme: 'bsmap'
      });
      value = -1;
    }
    return value;
  },
  buildBS: function(location, azimuth, color) {
    this.collection.bs.new({
      location: location,
      azimut: azimuth,
      title: null,
      color: color,
      size: 500,
      initial: true
    });
  },
  onClickAddress: function(item, e){
    if (this.panel.current_button !== 1) return;
    var text, self = this, colorpicker;
    text  = '<div style="margin-bottom: 13px;">Вы действительно хотите построить БС на месте адреса?</div>';
    text += '<div style="height: 23px;padding: 5px 0px;text-align: left;text-overflow: ellipsis;overflow: hidden;white-space: nowrap">Адрес: <b>' + this.escapeHTML(item.options.title) + '</b></div>';
    text += '<div style="height: 23px;padding: 5px 0px;text-align: left">Азимут: <input class="tab-panel-input-azimut"></div>';
    text += '<div style="height: 23px;padding: 5px 0px;text-align: left;display:flex;align-items:center">Цвет сектора:</div>';
    text += '<div style="height: 23px;padding: 5px 0px;text-align: left;display:flex;align-items:center"><input type="checkbox" checked>Удалить маркер адреса</div>';
    noty({
      text: text,
      type: 'confirm',
      timeout: false,
      layout: 'centerWide',
      theme: 'bsmap',
      modal: true,
      callback: {
        onShow: function(){
          $('ul#noty_center_wide_layout_container .tab-panel-input-azimut').val(self.panel.input_value_azimut);
          $('ul#noty_center_wide_layout_container .tab-panel-input-azimut').focus(function(){$(this).select();}).mouseup(function(e){e.preventDefault();});
          colorpicker = L.colorPicker()
            .addTo($('ul#noty_center_wide_layout_container div:eq(5)')[0])
            .setColor(self.panel.colorpicker_bs.getColor())
            .on('selected', function(){
              self.panel.colorpicker_bs.setColor(colorpicker.getColor());
            });
        }
      },
      buttons: [
        {
          addClass: 'btn btn-primary',
          text: 'Построить',
          onClick: function($noty) {
            var azimuth = self.buildBS_checkAzimuth($('ul#noty_center_wide_layout_container .tab-panel-input-azimut').val());
            if (azimuth === -1) {
              $('ul#noty_center_wide_layout_container .tab-panel-input-azimut').focus();
              return;
            }
            self.buildBS(item.options.location, azimuth, colorpicker.getColor());
            if ($('ul#noty_center_wide_layout_container input:checkbox').prop('checked')) {
              self.collection.address.delete(item);
            }
            $noty.close();
          }
        },{
          addClass: 'btn btn-danger',
          text: 'Отмена',
          onClick: function($noty) {
            $noty.close();
          }
        }
      ]
    });
  },
  autocompleteChange: function(){
    var place = this.autocomplete.getPlace();
    if (!place.geometry || !place.geometry.location) {
      L.DomUtil.addClass(this.panel.input_address, 'address-notfound');
      return;
    }
    L.DomUtil.removeClass(this.panel.input_address, 'address-notfound');
    this.buildPlace(place);
  },
  buildPlace: function(place){
    this.map.flyTo([place.geometry.location.lat(),place.geometry.location.lng()]);
    this.autocompleteBound();

    var address = '';
    if (place.address_components) {
      address = this.stripAddress([
        (place.address_components[0] && place.address_components[0].short_name || ''),
        (place.address_components[1] && place.address_components[1].short_name || ''),
        (place.address_components[2] && place.address_components[2].short_name || '')
      ].join(', '));
    }

    var item = this.collection.address.new({
      location: L.latLng([place.geometry.location.lat(),place.geometry.location.lng()]),
      title: address,
      initial: true
    });

    setTimeout((function(self){
      return function(){
        self.panel.input_address.value = '';
        self.panel.input_address.focus();
      };
    })(this), 100);

//    this.map.fitBounds([
//      [place.geometry.viewport.getSouthWest().lat(),place.geometry.viewport.getSouthWest().lng()],
//      [place.geometry.viewport.getNorthEast().lat(),place.geometry.viewport.getNorthEast().lng()]
//    ]);
  },
lookupRegion: function () {
  // Отримуємо дані з полів вводу
  var lac = parseInt($('.tab-panel-input-lac').val(), 10);
  var cid = parseInt($('.tab-panel-input-cid').val(), 10);
  var mnc = parseInt($('.tab-panel-region-oper:checked').val(), 10);
  var mcc = 255; // Mobile Country Code для України

  // --- Перевірка введених даних (залишаємо як було) ---
  if (isNaN(lac) || lac < 1 || lac > 65535) {
    noty({ text: 'Некоректне значення LAC (1-65535).', type: 'error', timeout: 5000, layout: 'bottomCenter', theme: 'bsmap' });
    this.panel._lookupRegionStop($('.tab-panel-input-lac')[0]);
    return;
  }
  if (isNaN(cid) || cid < 1 || cid > 268435455) { // CID може бути більшим для 4G
    noty({ text: 'Некоректне значення CID.', type: 'error', timeout: 5000, layout: 'bottomCenter', theme: 'bsmap' });
    this.panel._lookupRegionStop($('.tab-panel-input-cid')[0]);
    return;
  }
  if (isNaN(mnc)) {
    noty({ text: 'Будь ласка, виберіть оператора.', type: 'error', timeout: 5000, layout: 'bottomCenter', theme: 'bsmap' });
    return;
  }
  
  // --- Формуємо та виконуємо запит до OpenCelliD ---
  var self = this;
  var apiKey = "pk.8f3b23abe9fc85acfe1de224c95e6cd5"; // ВАШ КЛЮЧ
  
  var data = {
      token: apiKey,
      radio: 'gsm', // або 'lte' для 4G, для простоти залишаємо gsm
      mcc: mcc,
      mnc: mnc,
      cells: [{
          lac: lac,
          cid: cid
      }],
      address: 1
  };

  $.ajax({
    url: "https://us1.unwiredlabs.com/v2/process.php",
    type: "POST",
    data: JSON.stringify(data),
    contentType: "application/json; charset=utf-8",
    dataType: 'json',
    context: this,
    cache: false,
    success: function(response) {
      if (response.status === "ok" && response.balance > 0) {
        var location = L.latLng([response.lat, response.lon]);
        self.map.flyTo(location, 15); // Перелітаємо на знайдену точку
        
        // Створюємо новий об'єкт на карті
        self.collection.region.new({
          color: self.panel.colorpicker_region.getColor(),
          lac: lac,
          cid: cid,
          mnc: mnc,
          mcc: mcc,
          location_g: location, // Зберігаємо координати
          initial: true,
          title: response.address // Додаємо знайдену адресу як назву
        });

      } else {
        // Обробка помилок від OpenCelliD
        var errorMessage = response.message || 'Вежу не знайдено в базі даних OpenCelliD.';
        noty({ text: errorMessage, type: 'error', timeout: 5000, layout: 'bottomCenter', theme: 'bsmap' });
      }
    },
    error: function(jqXHR, status, error) {
      noty({ text: 'Помилка запиту до OpenCelliD: ' + status, type: 'error', timeout: 5000, layout: 'bottomCenter', theme: 'bsmap' });
    },
    complete: function(){
      self.panel._lookupRegionStop(); // Зупиняємо анімацію кнопки пошуку
    }
  });
},
