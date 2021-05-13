/**
 * Copyright 2017-2021, Voxel51, Inc.
 */

import { parseMediaFragmentsUri } from "../mediaFragments";
import { checkFontHeight, ICONS } from "../util";

export function asVideoRenderer(options) {
  const state = {
    boolAutoplay: false,
    boolLoop: false,
    boolPlaying: false,
    boolManualSeek: false,
    boolSingleFrame: false,
    overlayCanBePrepared: false, // need to wait for video metadata
    isVideoMetadataLoaded: false,
    hasMediaFragment: false,
    mfBeginT: null, // Time
    mfEndT: null,
    mfBeginF: null, // Frame
    mfEndF: null,
    lockToMF: false,
    frameDuration: 1 / options.fps,
    frameRate: options.fps,
  };

  const handleKeyboardEvent = (e) => {
    this.prototype._handleKeyboardEvent.call(this, e);
    if (e.keyCode === 32) {
      // space
      this._boolPlaying = !this._boolPlaying;
      this.updateFromDynamicState();
      return true;
    }
    // navigating frame-by-frame with arrow keys
    if (this.eleVideo.paused && (e.keyCode === 37 || e.keyCode === 39)) {
      if (e.keyCode === 37) {
        // left arrow
        this.eleVideo.currentTime = Math.max(
          0,
          this.computeFrameTime() - this.frameDuration
        );
      } else {
        // right arrow
        this.eleVideo.currentTime = Math.min(
          this.eleVideo.duration,
          this.computeFrameTime() + this.frameDuration
        );
      }
      this.updateStateFromTimeChange();
      return true;
    }
  };

  const renderer = Object.assign(this, {
    initPlayerControls() {
      this.eleVideo.addEventListener("loadeddata", function () {
        self._isDataLoaded = true;

        // Handles the case that we have a poster frame to indicate the video is
        // loading and now we can show the video.  But when we are not autoplay.
        // We need to set the state to playing if we are set to autoplay
        //  (the player itself will handle the autoplaying)
        if (self._boolAutoplay) {
          self._boolPlaying = true;
        } else if (self._hasMediaFragment) {
          self.eleVideo.currentTime = self._mfBeginT;
          self._frameNumber = self._mfBeginF;
        } else {
          self.eleVideo.currentTime = 0;
          self._frameNumber = 1;
        }

        self.updateFromLoadingState();

        if (self._boolSingleFrame) {
          self.eleVideo.currentTime = self._mfBeginT;
          self._frameNumber = self._mfBeginF;
        }

        // so that we see overlay and time stamp now that we are ready
        if (!self._boolAutoplay) {
          self.processFrame();
        }

        self.dispatchEvent("load");
      });

      this.eleVideo.addEventListener("ended", function () {
        if (self._boolLoop) {
          self.eleVideo.play();
        } else {
          self._boolPlaying = false;
          self.updateFromDynamicState();
        }
      });

      this.eleVideo.addEventListener("pause", function () {
        self.checkForFragmentReset(self.computeFrameNumber());
        if (
          self._boolPlaying &&
          !self._lockToMF &&
          !self._boolManualSeek &&
          !self.eleVideo.ended
        ) {
          self.eleVideo.play();
        }
      });

      // Update the seek bar as the video plays
      this.eleVideo.addEventListener("timeupdate", function () {
        // Calculate the slider value
        const value =
          (self.seekBarMax / self.eleVideo.duration) *
          self.eleVideo.currentTime;
        // Update the slider value
        self.eleSeekBar.value = value;
        self.dispatchEvent("timeupdate", {
          data: {
            frame_number: self.computeFrameNumber(),
          },
        });
      });

      this.eleVideo.addEventListener(
        "play",
        function () {
          self.timerCallback();
        },
        false
      );

      this.eleVideo.addEventListener("seeked", function () {
        self.updateStateFromTimeChange();
      });

      this.eleVideo.addEventListener("error", function () {
        if (self.player._boolNotFound) {
          self.eleVideo.setAttribute("poster", self.player._notFoundPosterURL);
        } else {
          self.eleVideo.remove();
        }
        self.dispatchEvent("error");
      });

      // Event listener for the play/pause button
      this.elePlayPauseButton.addEventListener("click", function (e) {
        e.stopPropagation();
        self._boolPlaying = !self._boolPlaying;
        self.updateFromDynamicState();
      });

      // Event listener for the seek bar
      this.eleSeekBar.addEventListener("change", function () {
        // Calculate the new time
        const time =
          self.eleVideo.duration *
          (self.eleSeekBar.valueAsNumber / self.seekBarMax);
        // Update the video time
        self.eleVideo.currentTime = self.clampTimeToFrameStart(time);
        // Unlock the fragment so the user can browse the whole video
        self._lockToMF = false;
        self._boolSingleFrame = false;
        self.updateStateFromTimeChange();
      });

      // Pause the video when the seek handle is being dragged
      this.eleSeekBar.addEventListener("mousedown", function () {
        if (!self.player.options.thumbnail) {
          self._boolManualSeek = true;
          // Unlock the fragment so the user can browse the whole video
          self._lockToMF = false;
          // We need to manually control the video-play state
          // And turn it back on as needed.
          self.eleVideo.pause();
        }
      });

      // Play the video when the seek handle is dropped
      this.eleSeekBar.addEventListener("mouseup", function (e) {
        self._boolManualSeek = false;
        if (self._boolPlaying && self.eleVideo.paused) {
          // Calculate the new time
          const seekRect = self.eleSeekBar.getBoundingClientRect();
          const time =
            self.eleVideo.duration *
            ((e.clientX - seekRect.left) / seekRect.width);
          // Update the video time
          self.eleVideo.currentTime = self.clampTimeToFrameStart(time);
          self.eleSeekBar.value =
            (time / self.eleVideo.duration) * self.seekBarMax;
          self.eleVideo.play();
        }
      });

      const hideControls = function () {
        if (self._boolShowVideoOptions) {
          return;
        }
        self._boolShowControls = false;
        self.updateFromDynamicState();
      };

      this.parent.addEventListener("mouseenter", function () {
        // Two different behaviors.
        // 1.
        // 1.  Regular Mode: show controls.
        // 2.  Thumbnail Mode: play video
        // 3.  Single Frame Mode: annotate
        self.player._boolHovering = true;
        if (!self._isDataLoaded) {
          return;
        }

        const eventArgs = { cancelable: true, data: { player: self.player } };
        self.dispatchEvent("mouseenter", eventArgs);
        if (!self.player.options.thumbnail) {
          self._boolShowControls = true;
          self.setTimeout("hideControls", hideControls, 2.5 * 1000);
        }
        self.updateFromDynamicState();
      });

      this.parent.addEventListener("mousemove", function (e) {
        if (!self.player.options.thumbnail) {
          if (self.checkMouseOnControls(e)) {
            self.clearTimeout("hideControls");
          } else {
            self._boolShowControls = true;
            self.setTimeout("hideControls", hideControls, 2.5 * 1000);
          }
        }
        self.updateFromDynamicState();
      });

      this.parent.addEventListener("mouseleave", function () {
        self.player._boolHovering = false;
        self._boolDisableShowControls = false;
        if (!self._isDataLoaded) {
          return;
        }

        const eventArgs = { cancelable: true, data: { player: self.player } };
        if (!self.dispatchEvent("mouseleave", eventArgs)) {
          return;
        } else if (self.player.options.thumbnail) {
          self._boolPlaying = false;
          // clear things we do not want to render any more
          self.clearCanvas();
        } else {
          hideControls();
          self.clearTimeout("hideControls");
        }
        self.updateFromDynamicState();
      });
    },

    updateFromDynamicState() {
      if (!this._isRendered || !this._isSizePrepared) {
        return;
      }
      if (this.options.fps && this.frameRate !== this.options.fps) {
        this.frameRate = this.options.fps;
        this.frameDuration = 1 / this.frameRate;
      }
      if (this._boolAutoplay) {
        this._boolAutoplay = false;
        this._boolPlaying = true;
      }
      if (this._boolPlaying) {
        if (
          this.eleVideo.paused &&
          !this._boolSingleFrame &&
          !this._boolManualSeek &&
          this._isOverlayPrepared
        ) {
          this.eleVideo.play();
        }
      } else {
        if (!this.eleVideo.paused && !this._boolSingleFrame) {
          this.eleVideo.pause();
          this.eleVideo.currentTime = this.clampTimeToFrameStart();
          this._updateFrame();
        }
      }
      this.updatePlayButton(this._boolPlaying);
      this.updateControlsDisplayState();
      this.processFrame();
    },

    updateFromLoadingState() {
      if (this._isRendered && this._isSizePrepared) {
        if (this._isDataLoaded) {
          this._isReadyProcessFrames = true;
        }
        // prepare overlay once video and labels are loaded
        if (this._overlayData !== null && this._isVideoMetadataLoaded) {
          this._overlayCanBePrepared = true;
        }
      }

      if (this._overlayCanBePrepared) {
        this.prepareOverlay();
      }

      if (this._isOverlayPrepared) {
        if (
          (!isFinite(this.frameRate) || !isFinite(this.frameDuration)) &&
          isFinite(this.eleVideo.duration)
        ) {
          // FPS wasn't provided, so guess it from the labels. If we don't have
          // labels either, we can't determine anything, so fall back to FPS = 30.
          const numFrames =
            Object.keys(this.frameOverlay).length ||
            this.eleVideo.duration * 30;
          this.frameRate = numFrames / this.eleVideo.duration;
          this.frameDuration = 1 / this.frameRate;
        }
      }
    },

    _updateFrame() {
      let cfn = this.computeFrameNumber();
      // check if we have a media fragment and should be looping
      // if so, reset the playing location appropriately
      cfn = this.checkForFragmentReset(cfn);
      if (cfn !== this._frameNumber && !this.eleVideo.seeking) {
        this._frameNumber = cfn;
        this.processFrame();
      }
    },

    timerCallback() {
      if (this.eleVideo.paused || this.eleVideo.ended) {
        this._updateFrame();
        return;
      }
      this.updateStateFromTimeChange();
      // if we are manually seeking right now, then do not set the manual callback
      if (!this._boolManualSeek) {
        requestAnimationFrame(this.timerCallback.bind(this));
      } else {
        /* eslint-disable-next-line no-console */
        console.log("NOT SETTING TIME CALLBACK");
      }
    },

    setMediaFragment() {
      // when we have a media fragment passed in, by
      // default, we force the player to stay within that fragment.  If the video is
      // looping, for example, then it will always go to the beginning of the
      // fragment.  However, as soon as the user scrubs the video, we turn off the
      // importance of the fragment so that the user can watch the whole video.
      const mfResult = parseMediaFragmentsUri(this.media.src);
      if (typeof mfResult.length) {
        this._mfBeginT = mfResult[0].startNormalized;
        this._mfEndT = mfResult[0].endNormalized;
        this._mfBeginF = this.computeFrameNumber(this._mfBeginT);
        this._mfEndF = this.computeFrameNumber(this._mfEndT);
        this._hasMediaFragment = true;
        this._lockToMF = true;
        if (this._mfBeginF === this._mfEndF) {
          this._boolSingleFrame = true;
        }
      }
    },

    checkForFragmentReset(fn) {
      if (!this._hasMediaFragment || !this._boolPlaying || !this._lockToMF) {
        return fn;
      }

      if (fn >= this._mfEndF || this.eleVideo.ended) {
        if (this._boolLoop) {
          this.eleVideo.currentTime = this._mfBeginT;
          fn = this._mfBeginF;
        } else {
          this._boolPlaying = false;
        }
      }

      return fn;
    },
  });
}
