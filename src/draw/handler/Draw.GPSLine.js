/**
 * @class L.Draw.GPSLine
 * @aka Draw.GPSLine
 * @inherits L.Draw.Polyline
 */

L.Draw.GPSLine = L.Draw.Feature.extend({
	statics: {
		TYPE: 'gpsline'
	},

	Poly: L.Polyline,
	Marker: L.Marker,

	options: {
		// Our unique options.
		minDistance: 5, // Min distance in meters for each point.
		minAccuracy: 10, // Mininmum accuracy to accept a point.
		markerIcon: new L.Icon.Default(), 
		smoothingFactor: 0, // Used in L.LineUtil.simplify

		// All the Location Options from: http://leafletjs.com/reference-1.2.0.html#locate-options
		watch: true,
		setView: true,
		maxZoom: Infinity,
		timeout: 10000,
		maximumAge: 0,
		enableHighAccuracy: false,

		// Plus the same relavant defaults as in Draw.Polyline.js
		icon: new L.DivIcon({
			iconSize: new L.Point(8, 8),
			className: 'leaflet-div-icon leaflet-editing-icon'
		}),
		touchIcon: new L.DivIcon({
			iconSize: new L.Point(20, 20),
			className: 'leaflet-div-icon leaflet-editing-icon leaflet-touch-icon'
		}),
		shapeOptions: {
			stroke: true,
			color: '#3388ff',
			weight: 4,
			opacity: 0.5,
			fill: false,
			clickable: true
		},
        zIndexOffset: 2000, // This should be > than the highest z-index any map layers

	},

	// @method initialize(): void
	initialize: function (map, options) {
		// if touch, switch to touch icon
		if (L.Browser.touch) {
			this.options.icon = this.options.touchIcon;
		}

		this.options = L.Util.extend( this.options, options );
		this._pointsAdded = 0;
		this._lastSmoothing = 0;

		// Save the type so super can fire, need to do this as cannot do this.TYPE :(
		this.type = L.Draw.GPSLine.TYPE;

		L.Draw.Feature.prototype.initialize.call(this, map, this.options);
	},


	// @method addHooks(): void
	// Add listener hooks to this handler
	addHooks: function () {
		L.Draw.Feature.prototype.addHooks.call(this);
		if ( this._map){

			this._markers = [];

			this._markerGroup = new L.LayerGroup();
			this._map.addLayer(this._markerGroup);

			this._poly = new L.Polyline([], this.options.shapeOptions);

			this._map.
				locate({
					watch: this.options.watch,
					setView: this.options.setView,
					maxZoom: this.options.maxZoom, 
					timeout: this.options.timeout,
					maximumAge: this.options.maximumAge,
					enableHighAccuracy: this.options.enableHighAccuracy
				});

			this._map
				.on('locationfound',this._locationfound, this)
				.on('mousemove', this._onMouseMove, this)
				.on('locationerror',this._locationerror, this);

			if ( L.Browser.touch ) {
				this._map
					.on('zoomend', this._touchZoomEnd, this)
					.on('moveend', this._touchZoomEnd, this);
			}
		}

		window.tooltip = this._tooltip;
	},

	// @method removeHooks(): void
	// Remove listener hooks from this handler.
	removeHooks: function () {
		L.Draw.Feature.prototype.removeHooks.call(this);

		this._map
		.off('mousemove', this._onMouseMove, this)
		.off('locationfound',this._locationfound, this)
		.off('locationerror',this._locationerror, this);

		if ( L.Browser.touch ) {
			this._map
				.on('zoomend', this._touchZoomEnd, this)
				.on('moveend', this._touchZoomEnd, this);
		}

		this._map.stopLocate();

		// remove markers from map
		this._map.removeLayer(this._markerGroup);
		delete this._markerGroup;
		delete this._markers;

		this._map.removeLayer(this._poly);
		delete this._poly;
	},

	// @method addVertex(): void
	// Add a vertex to the end of the polyline
	addVertex: function (latlng) {
		var markersLength = this._markers.length;

		if ( markersLength > 0 ) {
			var distance_from_old_marker = this._markers[markersLength - 1].getLatLng().distanceTo( latlng );
			if ( distance_from_old_marker < this.options.minDistance || distance_from_old_marker === 0 ) {
				return;
			}
		}

		latlng.x = latlng.lat;
		latlng.y = latlng.lng;

		this._markers.push(this._createMarker(latlng));

		this._poly.addLatLng(latlng);

		if (this._poly.getLatLngs().length === 2) {
			this._map.addLayer(this._poly);
		}

		this._pointsAdded++;

		if ( this.options.smoothingFactor > 0 && this._pointsAdded % 5 === 0 ) {
			// this._smoothLine();
		}

		this._map.fire(L.Draw.Event.DRAWVERTEX, { layers: this._markerGroup });
	},

	// @method completeShape(): void
	// Closes the polyline between the first and last points
	completeShape: function () {
		this._pointsAdded = 0;

		if (this._markers.length === 0 ) {
			return;
		}

		if ( this.options.smoothingFactor > 0 ) {
			// this._smoothLine();
		}

		this._fireCreatedEvent();
		this.disable();
	},

	_locationfound: function(e){
		if ( e.accuracy > this.options.minAccuracy ) {
			var labelText = {
				text: L.drawLocal.draw.handlers.gpsline.tooltip.lowaccuracy
			};
			this._tooltip.updateContent( labelText );
			this._tooltip.showAsError();
			return;
		}

		this.addVertex(e.latlng);
		this._getTooltipText();
	},

	_locationerror: function(e){
		var labelText = {
			text: e.message
		};
		this._tooltip.updateContent( labelText );
		this._tooltip.showAsError();
	},

	_smoothLine: function() {
		var smoothed = L.LineUtil.simplify( this._poly._latlngs,this.options.smoothingFactor );
		this._poly.setLatLngs( smoothed );

		var poly_i;
		var splice_count;
		for(var i=this._lastSmoothing; i<smoothed.length;){
			poly_i = this._poly._latlngs.indexOf( smoothed[i] );

			if ( poly_i === i ) {
				// Do nothing.
			} else {
				splice_count = (poly_i - i) + 1;
				this._markers = this._markers.splice(i, splice_count);
				this._markers = this._markers.splice(i, splice_count);
			}
		}

		this._lastSmoothing = smoothed.length;

		this._markerGroup.clearLayers();

		this._poly.setLatLngs( this._markers );
	},

	/**
	 * On touch screen our tooltips don't always show up. 
	 * We're going to put them right below the labels that stick out the sides of the buttons.
	 */
	_touchZoomEnd: function(e){
		var newPos = this._map.mouseEventToLayerPoint(e.originalEvent);
		var latlng = this._map.layerPointToLatLng(newPos);
		this._tooltip.updatePosition( latlng );
	},

	/**
	 * Get the contextual tooltip text.
	 */
	_getTooltipText: function(){
		var labelText;

		if (this._markers.length === 0) {
			labelText = {
				text: L.drawLocal.draw.handlers.gpsline.tooltip.start
			};
		} else {
			labelText = {
				text: L.drawLocal.draw.handlers.gpsline.tooltip.end,
			};
		}


		this._tooltip
			.removeError()
			.updateContent(labelText);

		return labelText;
	},

	_onMouseMove: function (e) {
		var newPos = this._map.mouseEventToLayerPoint(e.originalEvent);
		var latlng = this._map.layerPointToLatLng(newPos);

		this._tooltip.updatePosition(latlng);

		L.DomEvent.preventDefault(e.originalEvent);
	},



	//*******  Verbatim from Draw.Polyline.js *******/

	_fireCreatedEvent: function () {
		var latlngs = this._poly.getLatLngs();

		var shape;
		if ( latlngs.length === 1 ) {
			shape = new this.Marker( latlngs[0], {
					icon: this.options.markerIcon,
					zIndexOffset: this.options.zIndexOffset
			});
		} else {
			shape = new this.Poly(latlngs, this.options.shapeOptions);
		}
		L.Draw.Feature.prototype._fireCreatedEvent.call(this, shape);
	},

	_createMarker: function (latlng) {
		var marker = new L.Marker(latlng, {
			icon: this.options.icon,
			zIndexOffset: this.options.zIndexOffset * 2
		});

		this._markerGroup.addLayer(marker);

		return marker;
	}

});
