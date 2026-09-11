import { motion } from "framer-motion";
import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface AnimatedMascotProps {
  isPasswordField: boolean;
  showPassword: boolean;
  isTyping: boolean;
  className?: string;
}

export function AnimatedMascot({
  isPasswordField,
  showPassword,
  isTyping: istypingprop,
  className,
}: AnimatedMascotProps) {
  const [blinking, setBlinking] = useState(false);
  const [handsCovered, setHandsCovered] = useState(false);
  const [eyePosition, setEyePosition] = useState({ x: 0, y: 0 });
  const [headTilt, setHeadTilt] = useState(0);
  const timerRef = useRef<number>();
  const typingAnimationRef = useRef<number>();
  const lastUpdateRef = useRef(Date.now());
  const [isTyping, setIsTyping] = useState(false);
  const [isPasswordTyping, setIsPasswordTyping] = useState(false); // New state for password typing
  const [randomAnimation, setRandomAnimation] = useState("bouncing");
  const [idleBlinking, setIdleBlinking] = useState(false); // New state for regular blinking
  const [forceRender, setForceRender] = useState(false);
  const [focusedPasswordField, setFocusedPasswordField] = useState<string | null>(null);
  const [isSmiling, setIsSmiling] = useState(false); // State for random smile




  // Spring-based vertical bounce animation
  type RepeatType = "loop" | "reverse" | "mirror";
  
  const mascotVariants = {
    idle: {
      y: 0,
      rotate: 0,
      scale: 1,
      transition: { duration: 2 },
    },
    bouncing: {
      y: [0, -15],
      transition: {
        type: "spring",
        repeat: Infinity,
        repeatType: "reverse" as RepeatType,
        stiffness: 50,
        damping: 3,
        mass: 1,
        velocity: 5,
        restDelta: 0.001,
        restSpeed: 0.01,
      },
    },
    wobbling: {
      rotate: [0, -25, -25, 0],
      transition: {
        times: [0, 0.2, 0.6, 1],
        duration: 4,
        ease: ["easeInOut", "easeOut", "linear", "easeInOut"],
      },
    },
    scaling: {
      scale: [1, 1.05, 1],
      transition: { 
        duration: 2, 
        repeat: Infinity, 
        repeatType: "loop" as RepeatType,
        ease: "easeInOut" 
      },
    },
  };

  // Head movement animation - removed bouncing when typing
  const headVariants = {
    typing: {
      rotate: headTilt, 
      transition: { 
        type: "spring", 
        stiffness: 250, 
        damping: 25 
      },
    },
  };

  // Face container animation - normal state
  const faceVariants = {
    typing: {
      // No special animation during typing
      transition: { 
        type: "spring", 
        stiffness: 300, 
        damping: 25 
      },
    },
  };

  // Random animation switching effect
  useEffect(() => {
    const animations = ["idle", "wobbling", "idle", "scaling", "idle"];
    let animationTimeout: NodeJS.Timeout;

    const changeAnimation = () => {
      setRandomAnimation((prev) => {
        let nextAnimation;
        do {
          nextAnimation =
            animations[Math.floor(Math.random() * animations.length)];
        } while (nextAnimation === prev);
        return nextAnimation;
      });
      animationTimeout = setTimeout(
        changeAnimation,
        8000 + Math.random() * 5000,
      ); // Change every 8-13 sec
    };

    // Start the first change AFTER the initial bounce has run for a while
    animationTimeout = setTimeout(changeAnimation, 5000 + Math.random() * 2000); // Wait 5-7 sec before first switch

    return () => clearTimeout(animationTimeout); // Cleanup on unmount
  }, []);

  // Blinking (Now squint for password) animation
  // Updated blinking logic to support peeking
useEffect(() => {
  let activePasswordField: string | null = null;

  const updateBlinking = () => {
    const activeElement = document.activeElement as HTMLInputElement | null;
    const isPasswordFocused =
      activeElement &&
      (activeElement.name === "password" ||
        activeElement.name === "registerPassword" ||
        activeElement.name === "confirmPassword");

    if (!activeElement) {
      return; // 🔥 Prevents unnecessary state updates when switching windows
    }

    if (!isPasswordFocused) {
      setBlinking(false); // ✅ Reset if switching to non-password field
      return;
    }

    // ✅ Detect field switch
    const newActiveField = activeElement.name;
    if (activePasswordField !== newActiveField) {
      activePasswordField = newActiveField;
      setForceRender((prev) => !prev); // 🔥 Forces an immediate state update
    }

    // ✅ Right eye must close when transitioning from show → hide
    const isCurrentFieldVisible = activeElement.type === "text"; // 'text' = visible, 'password' = hidden
    setBlinking(!isCurrentFieldVisible); // ✅ Squint if hidden, peek if visible
    setEyePosition({ x: 0, y: 0 }); // ✅ Reset tracking immediately
  };

  document.addEventListener("focusin", updateBlinking);
  document.addEventListener("focusout", updateBlinking);

  return () => {
    document.removeEventListener("focusin", updateBlinking);
    document.removeEventListener("focusout", updateBlinking);
  };
}, []);



  // Force Rerender When Show/Hide Password Toggles
  useEffect(() => {
    setTimeout(() => {
      const activeElement = document.activeElement as HTMLInputElement;
      if (!activeElement) return; // If nothing is focused, do nothing

      // 🔥 Check if the focused field is a password field
      const isPasswordFocused =
        activeElement.name === "password" ||
        activeElement.name === "registerPassword" ||
        activeElement.name === "confirmPassword";

      if (isPasswordFocused) {
        const isCurrentFieldVisible = activeElement.type === "text";
        setBlinking(!isCurrentFieldVisible); // ✅ Immediately update squint state
      }
    }, 0); // 🔥 Ensures the DOM updates first before applying changes
  }, [showPassword]);


// ✅ Ensure Pupil Visibility Updates Instantly When Toggling Show/Hide
useEffect(() => {
  updateEyePosition(); // 🔥 Instantly update without delay
}, [showPassword]);





  /* 🔥 NEW: Idle Blinking Effect */
  useEffect(() => {
    const startIdleBlinking = () => {
      if (!isTyping && !blinking) {  // 🔥 Only blink if not squinting or typing
        setIdleBlinking(true);
        setTimeout(() => setIdleBlinking(false), 100); // Quick blink
      }
    };

    const scheduleNextBlink = () => {
      const nextBlink = 2000 + Math.random() * 6000; // Blinks every 2-5 seconds
      timerRef.current = window.setTimeout(() => {
        startIdleBlinking();
        scheduleNextBlink();
      }, nextBlink);
    };

    scheduleNextBlink(); // Start the blinking loop

    return () => clearTimeout(timerRef.current); // Cleanup on unmount
  }, [isTyping, blinking]); // 🔥 Reacts to changes in typing/squinting state

  /* 🆕 Random Facial Expressions */
  useEffect(() => {
    let expressionTimeout: NodeJS.Timeout;
    let animationTimeout: NodeJS.Timeout;

    // Schedule random facial expressions when idle
    const scheduleRandomExpression = () => {
      // Only show expressions when not typing or in password field
      if (!isTyping && !blinking && !isPasswordField) {
        // Random smile (50% chance when triggered) 
        if (Math.random() < 0.5) {
          setIsSmiling(true);
          animationTimeout = setTimeout(() => setIsSmiling(false), 2000);
        }
      }

      // Schedule next random expression
      const nextExpressionDelay = 5000 + Math.random() * 15000; // Every 5-20 seconds
      expressionTimeout = setTimeout(scheduleRandomExpression, nextExpressionDelay);
    };

    // Start the random expression loop
    expressionTimeout = setTimeout(scheduleRandomExpression, 5000);

    return () => {
      clearTimeout(expressionTimeout);
      clearTimeout(animationTimeout);
    };
  }, [isTyping, blinking, isPasswordField]);


  // Update eyes position based on field state

 const updateEyePosition = () => {
  const usernameInputs = document.querySelectorAll(
    "input[name='username'], input[name='registerUsername']"
  ) as NodeListOf<HTMLInputElement>;
  const passwordInputs = document.querySelectorAll(
    "input[name='password'], input[name='registerPassword'], input[name='confirmPassword']"
  ) as NodeListOf<HTMLInputElement>;

  let isUsernameFocused = false;
  let isPasswordFocused = false;
  let newEyePosition = { x: 0, y: 0 };

  // ✅ Username Field Tracking (Both Eyes Move)
  usernameInputs.forEach((input) => {
    if (document.activeElement === input) {
      isUsernameFocused = true;

      if (input.value.length === 0) {
        setEyePosition({ x: 0, y: 0 });
        setTimeout(() => {
          setIsTyping(false);
        }, 0);
        return;
      }

      setIsTyping(true);

      const cursorPos = input.selectionStart || 0;
      const inputRect = input.getBoundingClientRect();
      const visibleTextWidth = input.clientWidth;
      const scrollOffset = input.scrollLeft;

      let caretX = 0;
      if (cursorPos > 0) {
        const tempSpan = document.createElement("span");
        tempSpan.innerText = input.value.substring(0, cursorPos);
        tempSpan.style.visibility = "hidden";
        tempSpan.style.position = "absolute";
        tempSpan.style.whiteSpace = "pre";
        input.parentNode?.appendChild(tempSpan);

        caretX =
          tempSpan.getBoundingClientRect().right - inputRect.left - scrollOffset;
        tempSpan.remove();
      }

      const maxMovementX = Math.min(8, visibleTextWidth / 20);
      const maxMovementY = 4;
      newEyePosition = {
        x: Math.max(-maxMovementX, Math.min((caretX / visibleTextWidth) * (maxMovementX * 2) - maxMovementX, maxMovementX)),
        y: maxMovementY,
      };
    }
  });

  // ✅ Password Field Handling (ONLY Right Eye Moves in Peeking Mode)
  passwordInputs.forEach((input) => {
    if (document.activeElement === input) {
      isPasswordFocused = true;

      if (showPassword) {
        const cursorPos = input.selectionStart || 0;
        const inputRect = input.getBoundingClientRect();
        const visibleTextWidth = input.clientWidth;
        const scrollOffset = input.scrollLeft;

        let caretX = 0;
        if (cursorPos > 0) {
          const tempSpan = document.createElement("span");
          tempSpan.innerText = input.value.substring(0, cursorPos);
          tempSpan.style.visibility = "hidden";
          tempSpan.style.position = "absolute";
          tempSpan.style.whiteSpace = "pre";
          input.parentNode?.appendChild(tempSpan);

          caretX =
            tempSpan.getBoundingClientRect().right - inputRect.left - scrollOffset;
          tempSpan.remove();
        }

        const maxMovementX = Math.min(8, visibleTextWidth / 20);
        const maxMovementY = 4;
        newEyePosition = {
          x: Math.max(-maxMovementX, Math.min((caretX / visibleTextWidth) * (maxMovementX * 2) - maxMovementX, maxMovementX)),
          y: maxMovementY,
        };
      }
    }
  });

  // ✅ Apply Correct Eye Tracking for Username and Password Fields
  if (isUsernameFocused) {
    setEyePosition(newEyePosition); // Both eyes track in username field
  } else if (isPasswordFocused && showPassword) {
    setEyePosition({
      x: newEyePosition.x, 
      y: newEyePosition.y
    }); // Only right eye tracks in password peeking
  }

  // ✅ Squinting when password is hidden
  if (isPasswordFocused && !showPassword) {
    setBlinking(true);
    setEyePosition({ x: 0, y: 0 }); // Reset eye tracking for password field when squinting
  } 

 // ✅ Reset When No Fields Are Focused
if (!isUsernameFocused && !isPasswordFocused) {
  setIsTyping(false);
  setEyePosition({ x: 0, y: 0 });
}

// ✅ NEW: Ensure eyebrows reset when switching from username → password
if (!isUsernameFocused && isPasswordFocused) {
  setIsTyping(false); // 🔥 This is what you were missing!
}

};



// ✅ Attach event listeners to track input focus/movement
useEffect(() => {
  document.addEventListener("focusin", updateEyePosition);
  document.addEventListener("input", updateEyePosition);
  document.addEventListener("click", updateEyePosition);
  document.addEventListener("keydown", updateEyePosition);
  document.addEventListener("keyup", updateEyePosition);
  document.addEventListener("paste", updateEyePosition);

  return () => {
    document.removeEventListener("focusin", updateEyePosition);
    document.removeEventListener("input", updateEyePosition);
    document.removeEventListener("click", updateEyePosition);
    document.removeEventListener("keydown", updateEyePosition);
    document.removeEventListener("keyup", updateEyePosition);
    document.removeEventListener("paste", updateEyePosition);
  };
}, [showPassword]);

   useEffect(() => {
     setForceRender((prev) => !prev); // 🔥 Triggers a forced re-render
     updateEyePosition(); // 🔥 Ensures immediate eye tracking update
   }, [showPassword]);

  {
    /* Pin Container */
  }
  return (
    <div className={cn("w-40 h-40 mx-auto", className)}>
      <motion.svg
        viewBox="0 0 200 200"
        animate={randomAnimation}
        variants={mascotVariants}
      >
        <defs>
          <linearGradient id="pinGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop
              offset="0%"
              style={{ stopColor: "#37D66C", stopOpacity: 1 }}
            />
            <stop
              offset="50%"
              style={{ stopColor: "#28AF53", stopOpacity: 1 }}
            />
            <stop
              offset="100%"
              style={{ stopColor: "#1E883A", stopOpacity: 1 }}
            />
          </linearGradient>
          <filter id="dropShadow" x="-30%" y="-30%" width="220%" height="220%">
            <feDropShadow
              dx="9"
              dy="9"
              stdDeviation="9"
              floodColor="rgba(0, 0, 0, 0.4)"
            />
          </filter>
          <filter id="innerShadow" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur in="SourceAlpha" stdDeviation="4" result="blur" />
            <feOffset in="blur" dx="2" dy="2" result="offsetBlur" />
            <feComposite in="SourceGraphic" in2="offsetBlur" operator="over" />
          </filter>
          
          <linearGradient id="highlightGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.7)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        <motion.circle
          cx="100"
          cy="80"
          r="50"
          fill="url(#pinGradient)"
          stroke="#1E883A"
          strokeWidth="3"
          filter="url(#dropShadow)"
          animate="typing"
          variants={headVariants}
        />
        
        {/* Highlight overlay */}
        <motion.ellipse
          cx="85" 
          cy="65"
          rx="20"
          ry="15"
          fill="url(#highlightGradient)"
          opacity="0.25"
          animate="typing"
          variants={headVariants}
        />

        <motion.polygon
          points="100,160 78,127 122,127"
          fill="url(#pinGradient)"
          stroke="#1E883A"
          strokeWidth="5"
          filter="url(#dropShadow)"
        />
        
        {/* Pin point highlight */}
        <motion.polygon
          points="100,158 90,133 110,133" 
          fill="url(#highlightGradient)"
          opacity="0.15"
        />

        {/* Face Container */}
        <motion.g animate="typing" variants={faceVariants}>
          <defs>
            <clipPath id="faceClip">
              <circle cx="100" cy="80" r="48" />
            </clipPath>

            <radialGradient id="faceGradient" cx="50%" cy="50%" r="50%">
              <stop
                offset="0%"
                style={{ stopColor: "#FFFFFF", stopOpacity: 1 }}
              />
              <stop
                offset="80%"
                style={{ stopColor: "#F0F0F0", stopOpacity: 1 }}
              />
              <stop
                offset="100%"
                style={{ stopColor: "#D8D8D8", stopOpacity: 1 }}
              />
            </radialGradient>
          </defs>

          <g clipPath="url(#faceClip)">
            <circle
              cx="100"
              cy="80"
              r="48"
              fill="url(#faceGradient)"
              stroke="hsl(222.2 47.4% 11.2%)"
              strokeWidth="2.5"
              filter="url(#innerShadow)"
            />
          </g>

          {/* Facial Features */}

         {/* Left Eyebrow */}
            <motion.path
              d="M72 62 Q82 54 92 62"
              fill="none"
              stroke="hsl(222.2 47.4% 11.2%)"
              strokeWidth="4"
              strokeLinecap="round"
              animate={{
                d: isTyping ? "M70 58 Q80 42 92 56" : "M72 62 Q82 54 92 62", // 🔥 Now resets properly!
              }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            />

          {/* Right Eyebrow */}
            <motion.path
              d="M108 62 Q118 54 128 62"
              fill="none"
              stroke="hsl(222.2 47.4% 11.2%)"
              strokeWidth="4"
              strokeLinecap="round"
              animate={{
                d: isTyping ? "M108 64 Q118 56 128 64" : "M108 62 Q118 54 128 62", // 🔥 Now resets properly!
              }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            />



          {/* Eyes */}
              {/* Left Eye: Fully Shuts When Peeking (ONLY for Password Field) */}
                <motion.ellipse
  cx="85"
  cy="76"
  rx="10"
  ry={10} // Initial value to prevent undefined warning
  animate={{
    ry: idleBlinking
      ? 0 // Close fully during a blink
      : isPasswordField
      ? showPassword
        ? 2
        : 2
      : 10,
  }}
  transition={{ duration: 0.1, ease: "easeInOut" }} // Faster blink speed
  fill="white"
  stroke="hsl(222.2 47.4% 11.2%)"
  strokeWidth="2"
/>


                {/* Right Eye: Tracks Only When Peeking */}
<motion.ellipse
  cx="115"
  cy="76"
  rx="10"
  ry={10} // Initial value to prevent undefined warning
  animate={{
    ry:
      idleBlinking || blinking || (isPasswordField && !showPassword)
        ? 2 // Force Squint when hiding password
        : isPasswordField && showPassword
        ? 10 // Peeking → Open Eye
        : 10, // Default Open
  }}
  transition={{ duration: 0.1, ease: "easeInOut" }} // Faster blink speed
  fill="white"
  stroke="hsl(222.2 47.4% 11.2%)"
  strokeWidth="2"
/>








          {/* Right Eye Pupil (Tracks in Username, Tracks Alone in Password Peeking) */}
         <motion.circle
  cx={
    isPasswordField && showPassword
      ? 115 + eyePosition.x
      : isPasswordField
      ? 115
      : 115 + eyePosition.x
  }
  cy={76 + eyePosition.y}
  r="3"
  fill="hsl(222.2 47.4% 11.2%)"
  opacity={1} // Initial value to prevent undefined warning
  animate={{
    opacity:
      idleBlinking || blinking || (isPasswordField && !showPassword)
        ? 0 // Hide pupils when blinking (both idle and password field)
        : 1,
  }}
  transition={{ duration: 0.1, ease: "easeInOut" }} // Slightly faster fade
/>

{/* Right Eye Glint */}
<motion.circle
  cx={
    isPasswordField && showPassword
      ? 117 + eyePosition.x
      : isPasswordField
      ? 117
      : 117 + eyePosition.x
  }
  cy={74 + eyePosition.y}
  r="1.2"
  fill="white"
  opacity={0.8} // Initial value to prevent undefined warning
  animate={{
    opacity:
      idleBlinking || blinking || (isPasswordField && !showPassword)
        ? 0
        : 0.8,
  }}
  transition={{ duration: 0.1, ease: "easeInOut" }}
/>





                    {/* Pupils (Fade out during blink instead of disappearing instantly) */}
                     {/* Left Eye Pupil (Tracks in Username Field, Disappears in Password Peeking) */}
         <motion.circle
  cx={85 + (isPasswordField && showPassword ? 0 : eyePosition.x)}
  cy={76 + (isPasswordField && showPassword ? 0 : eyePosition.y)}
  r="3"
  fill="hsl(222.2 47.4% 11.2%)"
  opacity={1} // Initial value to prevent undefined warning
  animate={{
    opacity:
      idleBlinking || blinking || (isPasswordField && showPassword)
        ? 0 // Ensure pupils disappear during idle blinking
        : 1,
  }}
  transition={{ duration: 0.1, ease: "easeInOut" }} // Matches blink speed
/>

{/* Left Eye Glint */}
<motion.circle
  cx={87 + (isPasswordField && showPassword ? 0 : eyePosition.x)}
  cy={74 + (isPasswordField && showPassword ? 0 : eyePosition.y)}
  r="1.2"
  fill="white"
  opacity={0.8} // Initial value to prevent undefined warning
  animate={{
    opacity:
      idleBlinking || blinking || (isPasswordField && showPassword)
        ? 0
        : 0.8,
  }}
  transition={{ duration: 0.1, ease: "easeInOut" }}
/>



          {/* Smile that changes with random expressions */}
          <motion.path
            d="M85 96 Q100 106 115 96" // Initial path value to prevent undefined warning
            fill="none"
            stroke="hsl(222.2 47.4% 11.2%)"
            strokeWidth="3"
            strokeLinecap="round"
            animate={{
              d: isSmiling 
                ? "M80 96 Q100 112 120 96" // Bigger smile when randomly "smiling"
                : "M85 96 Q100 106 115 96", // Normal smile
            }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 25 
            }}
          />
          
          {/* Left Cheek - Appears when smiling */}
          <motion.path
            d="M75.365 96.3225 C 77.915 95.4125, 79.355 92.6825, 79.365 89.5825"
            fill="none"
            stroke="hsl(222.2 47.4% 11.2%)"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{
              opacity: isSmiling ? 1 : 0,
              d: isSmiling 
                ? "M75.365 96.3225 C 77.915 95.4125, 79.355 92.6825, 79.365 89.5825"
                : "M75.365 96.3225 C 77.915 95.4125, 79.355 92.6825, 79.365 89.5825"
            }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 25 
            }}
          />
          
          {/* Right Cheek - Appears when smiling */}
          <motion.path
            d="M124.635 96.3225 C 122.085 95.4125, 120.645 92.6825, 120.635 89.5825"
            fill="none"
            stroke="hsl(222.2 47.4% 11.2%)"
            strokeWidth="2"
            strokeLinecap="round"
            initial={{ opacity: 0 }}
            animate={{
              opacity: isSmiling ? 1 : 0,
              d: isSmiling 
                ? "M124.635 96.3225 C 122.085 95.4125, 120.645 92.6825, 120.635 89.5825"
                : "M124.635 96.3225 C 122.085 95.4125, 120.645 92.6825, 120.635 89.5825"
            }}
            transition={{ 
              type: "spring", 
              stiffness: 300, 
              damping: 25
            }}
          />
        </motion.g>

      </motion.svg>
    </div>
  );
}