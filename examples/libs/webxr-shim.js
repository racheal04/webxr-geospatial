/**
 * webxr-shim.js
 * Bridges the 2019-era WebXR API to modern WebXR API, and fills missing globals
 * that webxr-geospatial.js requires (window.XRAnchor, window.XRDevice).
 *
 * Two modes:
 *   A) Modern Chrome (no requestDevice on navigator.xr):
 *      - Creates XRDevice/XRAnchor classes
 *      - Shims requestDevice, requestFrameOfReference, getDevicePose, etc.
 *      - Delegates to native navigator.xr.requestSession('immersive-ar', ...)
 *
 *   B) WebXR Viewer / old polyfill (requestDevice exists):
 *      - Creates XRDevice/XRAnchor classes if missing
 *      - Wraps existing requestDevice so returned devices inherit from our XRDevice
 *        (so that webxr-geospatial.js's prototype patch takes effect)
 *      - Adds session shims (addAnchor, getDevicePose, etc.) if not present
 */

(function () {
  'use strict';

  if (!navigator.xr) return;
  if (navigator.xr.__webxrShimApplied) return;

  var _hasXRDevice = !!window.XRDevice;
  var _hasXRAnchor = !!window.XRAnchor;
  var _hasRequestDevice = (typeof navigator.xr.requestDevice === 'function');

  // If everything is already in place, nothing to do
  if (_hasXRDevice && _hasXRAnchor && _hasRequestDevice) {
    console.log('[webxr-shim] Complete old API already available.');
    return;
  }

  console.log('[webxr-shim] Applying shim. Has: XRDevice=' + _hasXRDevice +
    ' XRAnchor=' + _hasXRAnchor + ' requestDevice=' + _hasRequestDevice);
  navigator.xr.__webxrShimApplied = true;

  // ========== Matrix helpers ==========
  function mat4_identity(out) {
    out[0]=1;out[1]=0;out[2]=0;out[3]=0;
    out[4]=0;out[5]=1;out[6]=0;out[7]=0;
    out[8]=0;out[9]=0;out[10]=1;out[11]=0;
    out[12]=0;out[13]=0;out[14]=0;out[15]=1;
    return out;
  }
  function mat4_invert(out, a) {
    var a00=a[0],a01=a[1],a02=a[2],a03=a[3];
    var a10=a[4],a11=a[5],a12=a[6],a13=a[7];
    var a20=a[8],a21=a[9],a22=a[10],a23=a[11];
    var a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    var b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10,b03=a01*a12-a02*a11;
    var b04=a01*a13-a03*a11,b05=a02*a13-a03*a12,b06=a20*a31-a21*a30,b07=a20*a32-a22*a30;
    var b08=a20*a33-a23*a30,b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
    var det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if(!det) return null;
    det=1.0/det;
    out[0]=(a11*b11-a12*b10+a13*b09)*det;
    out[1]=(a02*b10-a01*b11-a03*b09)*det;
    out[2]=(a31*b05-a32*b04+a33*b03)*det;
    out[3]=(a22*b04-a21*b05-a23*b03)*det;
    out[4]=(a12*b08-a10*b11-a13*b07)*det;
    out[5]=(a00*b11-a02*b08+a03*b07)*det;
    out[6]=(a32*b02-a30*b05-a33*b01)*det;
    out[7]=(a20*b05-a22*b02+a23*b01)*det;
    out[8]=(a10*b10-a11*b08+a13*b06)*det;
    out[9]=(a01*b08-a00*b10-a03*b06)*det;
    out[10]=(a30*b04-a31*b02+a33*b00)*det;
    out[11]=(a21*b02-a20*b04-a23*b00)*det;
    out[12]=(a11*b07-a10*b09-a12*b06)*det;
    out[13]=(a00*b09-a01*b07+a02*b06)*det;
    out[14]=(a31*b01-a30*b03-a32*b00)*det;
    out[15]=(a20*b03-a21*b01+a22*b00)*det;
    return out;
  }
  function mat4_multiply(out, a, b) {
    var a00=a[0],a01=a[1],a02=a[2],a03=a[3];
    var a10=a[4],a11=a[5],a12=a[6],a13=a[7];
    var a20=a[8],a21=a[9],a22=a[10],a23=a[11];
    var a30=a[12],a31=a[13],a32=a[14],a33=a[15];
    var b0,b1,b2,b3;
    b0=b[0];b1=b[1];b2=b[2];b3=b[3];
    out[0]=b0*a00+b1*a10+b2*a20+b3*a30;
    out[1]=b0*a01+b1*a11+b2*a21+b3*a31;
    out[2]=b0*a02+b1*a12+b2*a22+b3*a32;
    out[3]=b0*a03+b1*a13+b2*a23+b3*a33;
    b0=b[4];b1=b[5];b2=b[6];b3=b[7];
    out[4]=b0*a00+b1*a10+b2*a20+b3*a30;
    out[5]=b0*a01+b1*a11+b2*a21+b3*a31;
    out[6]=b0*a02+b1*a12+b2*a22+b3*a32;
    out[7]=b0*a03+b1*a13+b2*a23+b3*a33;
    b0=b[8];b1=b[9];b2=b[10];b3=b[11];
    out[8]=b0*a00+b1*a10+b2*a20+b3*a30;
    out[9]=b0*a01+b1*a11+b2*a21+b3*a31;
    out[10]=b0*a02+b1*a12+b2*a22+b3*a32;
    out[11]=b0*a03+b1*a13+b2*a23+b3*a33;
    b0=b[12];b1=b[13];b2=b[14];b3=b[15];
    out[12]=b0*a00+b1*a10+b2*a20+b3*a30;
    out[13]=b0*a01+b1*a11+b2*a21+b3*a31;
    out[14]=b0*a02+b1*a12+b2*a22+b3*a32;
    out[15]=b0*a03+b1*a13+b2*a23+b3*a33;
    return out;
  }

  // ========== XRAnchor class (required by webxr-geospatial.js) ==========
  if (!window.XRAnchor) {
    var _anchorUID = 0;
    window.XRAnchor = function XRAnchor(modelMatrix, uid) {
      this._modelMatrix = modelMatrix ? new Float32Array(modelMatrix) : new Float32Array([
        1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1
      ]);
      this.uid = uid || ('anchor-' + (++_anchorUID) + '-' + Date.now());
      this.timeStamp = performance.now();
      this._listeners = {};
    };
    XRAnchor.prototype = {
      get modelMatrix() { return this._modelMatrix; },
      set modelMatrix(m) { this._modelMatrix = new Float32Array(m); },

      updateModelMatrix: function (modelMatrix, timeStamp) {
        this._modelMatrix = new Float32Array(modelMatrix);
        this.timeStamp = timeStamp || performance.now();
        if (this._listeners['update']) {
          var fns = this._listeners['update'];
          for (var i = 0; i < fns.length; i++) {
            try { fns[i].call(this, { source: this }); } catch(e) { console.error(e); }
          }
        }
      },

      addEventListener: function (type, fn) {
        if (!this._listeners[type]) this._listeners[type] = [];
        if (this._listeners[type].indexOf(fn) < 0) this._listeners[type].push(fn);
      },

      removeEventListener: function (type, fn) {
        if (!this._listeners[type]) return;
        var i = this._listeners[type].indexOf(fn);
        if (i >= 0) this._listeners[type].splice(i, 1);
      },

      dispatchEvent: function (event) {
        if (typeof event === 'string') {
          event = { type: event };
        }
        if (!this._listeners[event.type]) return;
        var fns = this._listeners[event.type].slice();
        for (var i = 0; i < fns.length; i++) {
          try { fns[i].call(this, event); } catch(e) { console.error(e); }
        }
      }
    };
    console.log('[webxr-shim] XRAnchor installed');
  }

  // ========== Session shimming ==========
  function shimSession(session) {
    if (session.__shimmed) return session;
    session.__shimmed = true;
    session._refSpaces = {};
    session._anchors = [];

    // requestFrameOfReference (if missing)
    if (!session.requestFrameOfReference) {
      var _origRequestRefSpace = null;
      if (session.requestReferenceSpace) {
        _origRequestRefSpace = session.requestReferenceSpace.bind(session);
      }
      session.requestFrameOfReference = function (type) {
        console.log('[webxr-shim] requestFrameOfReference:', type);
        var refSpaceType = (type === 'eye-level') ? 'viewer' : 'local';

        if (session._refSpaces[type]) {
          return Promise.resolve(session._refSpaces[type]);
        }

        var promise;
        if (_origRequestRefSpace) {
          // Modern browser
          promise = _origRequestRefSpace(refSpaceType).catch(function () {
            return _origRequestRefSpace('local');
          });
        } else if (session.requestFrameOfReference) {
          // Old API already exists (won't reach here since we only add if missing)
          promise = session.requestFrameOfReference.call(session, type);
        } else {
          return Promise.reject(new Error('No reference space mechanism'));
        }

        return promise.then(function (refSpace) {
          refSpace._shimType = type;
          if (!refSpace.getTransformTo) {
            refSpace.getTransformTo = function (other, out) {
              if (!out) out = new Float32Array(16);
              mat4_identity(out);
              return out;
            };
          }
          session._refSpaces[type] = refSpace;
          session._refSpaces[refSpaceType] = refSpace;
          return refSpace;
        });
      };
    }

    // Simulated anchors (if missing)
    if (!session.addAnchor) {
      session.addAnchor = function (matrix, frameOfReference) {
        console.log('[webxr-shim] addAnchor');
        var anchor = new XRAnchor(matrix);
        anchor._frameOfReference = frameOfReference;
        session._anchors.push(anchor);
        setTimeout(function () {
          if (anchor._listeners && anchor._listeners['update']) {
            var fns = anchor._listeners['update'];
            for (var i = 0; i < fns.length; i++) {
              try { fns[i].call(anchor, { source: anchor }); } catch(e) {}
            }
          }
        }, 0);
        return Promise.resolve(anchor);
      };
    }

    if (!session.removeAnchor) {
      session.removeAnchor = function (anchor) {
        var idx = session._anchors.indexOf(anchor);
        if (idx >= 0) session._anchors.splice(idx, 1);
        if (anchor._listeners && anchor._listeners['remove']) {
          var fns = anchor._listeners['remove'];
          for (var i = 0; i < fns.length; i++) {
            try { fns[i].call(anchor, { source: anchor }); } catch(e) {}
          }
        }
        return Promise.resolve();
      };
    }

    // baseLayer setter (if old-style assignment is used)
    if (!Object.getOwnPropertyDescriptor(session, 'baseLayer') ||
        Object.getOwnPropertyDescriptor(session, 'baseLayer').writable === false) {
      // Only patch if needed
    }

    return session;
  }

  // ========== Mode A: Modern Chrome (no requestDevice) ==========
  if (!_hasRequestDevice) {
    console.log('[webxr-shim] Mode A: Modern browser - full shim');
    var _origRequestSession = navigator.xr.requestSession.bind(navigator.xr);
    var _origIsSupported = navigator.xr.isSessionSupported.bind(navigator.xr);

    // Create XRDevice class that wraps native API
    if (!window.XRDevice) {
      function XRDevice() { this._activeSession = null; }

      XRDevice.prototype.requestSession = function (options) {
        console.log('[webxr-shim] XRDevice.requestSession()', options);
        var self = this;
        var sessionInit = { requiredFeatures: ['local'], optionalFeatures: [] };

        if (options && options.alignEUS) {
          sessionInit.requiredFeatures.push('local-floor');
        }

        return _origRequestSession('immersive-ar', sessionInit)
          .catch(function () {
            sessionInit.requiredFeatures = ['local'];
            return _origRequestSession('immersive-ar', sessionInit);
          })
          .then(function (session) {
            self._activeSession = session;
            return shimSession(session);
          });
      };

      XRDevice.prototype.supportsSession = function () {
        return _origIsSupported('immersive-ar').catch(function () { return false; });
      };

      XRDevice.prototype.endSession = function () {
        if (this._activeSession) {
          this._activeSession.end();
          this._activeSession = null;
        }
      };

      window.XRDevice = XRDevice;
    }

    // Add requestDevice
    var _activeXRDevice = new window.XRDevice();
    navigator.xr.requestDevice = function () {
      console.log('[webxr-shim] requestDevice()');
      return Promise.resolve(_activeXRDevice);
    };

    // frame.getDevicePose shim
    if (window.XRFrame && XRFrame.prototype && XRFrame.prototype.getViewerPose) {
      var _origGetViewerPose = XRFrame.prototype.getViewerPose;
      XRFrame.prototype.getDevicePose = function (frameOfReference) {
        var viewerPose = _origGetViewerPose.call(this, frameOfReference);
        if (!viewerPose) { this._shimViews = []; return null; }
        this._shimViews = viewerPose.views || [];
        viewerPose.getViewMatrix = function (view) {
          var viewMat = new Float32Array(16);
          var invPose = new Float32Array(16);
          var invView = new Float32Array(16);
          if (viewerPose.transform && viewerPose.transform.matrix) {
            mat4_invert(invPose, viewerPose.transform.matrix);
          } else { mat4_identity(invPose); }
          if (view.transform && view.transform.matrix) {
            mat4_invert(invView, view.transform.matrix);
          } else { mat4_identity(invView); }
          mat4_multiply(viewMat, invView, invPose);
          return viewMat;
        };
        return viewerPose;
      };
    }

    // frame.views property
    if (window.XRFrame && XRFrame.prototype && !Object.getOwnPropertyDescriptor(XRFrame.prototype, 'views')) {
      Object.defineProperty(XRFrame.prototype, 'views', {
        get: function () { return this._shimViews || []; },
        configurable: true
      });
    }

    // canvas.getContext('xrpresent') stub
    var _origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (contextType, contextAttributes) {
      if (contextType === 'xrpresent') {
        console.log('[webxr-shim] xrpresent context stub');
        return { __isXRPresentStub: true };
      }
      var ctx = _origGetContext.call(this, contextType, contextAttributes);
      if (ctx && contextAttributes && contextAttributes.compatibleXRDevice) {
        if (typeof ctx.makeXRCompatible === 'function') {
          ctx.makeXRCompatible().catch(function (err) {
            console.warn('[webxr-shim] makeXRCompatible failed:', err);
          });
        }
      }
      return ctx;
    };

    _origIsSupported('immersive-ar').then(function (s) {
      console.log('[webxr-shim] immersive-ar supported:', s);
    }).catch(function () {});

  } else {
    // ========== Mode B: WebXR Viewer / old polyfill ==========
    // requestDevice already exists. We just need:
    // 1. window.XRDevice class (so webxr-geospatial.js can patch prototype)
    // 2. Wrap navigator.xr.requestDevice to return instances of our XRDevice
    // 3. Shim session methods on returned sessions
    console.log('[webxr-shim] Mode B: Old API (WebXR Viewer) - filling globals');

    var _origRequestDevice = navigator.xr.requestDevice.bind(navigator.xr);

    if (!window.XRDevice) {
      // Create XRDevice wrapper. Instances wrap a real device from the old API.
      function XRDevice(realDevice) {
        this._realDevice = realDevice;
        this._activeSession = null;
      }

      XRDevice.prototype.requestSession = function (options) {
        console.log('[webxr-shim] XRDevice.requestSession() [old API]', options);
        var self = this;
        return this._realDevice.requestSession(options).then(function (session) {
          self._activeSession = session;
          return shimSession(session);
        });
      };

      XRDevice.prototype.supportsSession = function (options) {
        return this._realDevice.supportsSession(options);
      };

      XRDevice.prototype.endSession = function (sessionId) {
        if (this._activeSession) {
          this._activeSession.end();
          this._activeSession = null;
        }
      };

      window.XRDevice = XRDevice;
    }

    // Wrap navigator.xr.requestDevice to return our XRDevice instances
    navigator.xr.requestDevice = function () {
      console.log('[webxr-shim] requestDevice() [wrapping]');
      return _origRequestDevice().then(function (realDevice) {
        return new window.XRDevice(realDevice);
      });
    };
  }

  // ========== Common: canvas baseLayer setter shim ==========
  // This is needed for both modes
  (function () {
    var _origGetContext2 = HTMLCanvasElement.prototype.getContext;
    // The shim is applied per-session in shimSession, but we also need
    // the baseLayer setter on sessions returned by old API
  })();

  console.log('[webxr-shim] Done. XRDevice=' + !!window.XRDevice +
    ' XRAnchor=' + !!window.XRAnchor +
    ' requestDevice=' + (typeof navigator.xr.requestDevice === 'function'));
})();
