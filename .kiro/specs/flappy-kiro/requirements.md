# Requirements Document

## Introduction

Flappy Kiro is a retro, browser-based endless scroller inspired by Flappy Bird. The player controls a ghost character ("Ghosty") that must navigate through an endless series of pipe gaps. The player taps or clicks to make the ghost flap upward against constant gravity. Scattered between the pipes are collectible point items (a cute white "chiikawa" character) that increase the player's score when collected. The game presents a retro pixel-art aesthetic, plays sound effects for flapping and game over, and ends when the ghost collides with a pipe or the ground. The game is intended to run entirely in a modern web browser using existing workspace assets.

## Glossary

- **Game**: The complete Flappy Kiro browser application, including rendering, input handling, physics, scoring, and audio.
- **Ghost**: The player-controlled character sprite (sourced from `assets/ghosty.png`) that moves vertically in response to player input and gravity.
- **Pipe_Pair**: A pair consisting of one top pipe and one bottom pipe separated by a vertical gap, through which the Ghost must pass.
- **Gap**: The vertical opening between the top and bottom pipe of a Pipe_Pair through which the Ghost can pass without collision.
- **Collectible**: A point item sprite (sourced from `img/chiikawa_point.png`) that increases the player's Score when the Ghost overlaps it.
- **Score**: An integer counter representing the player's accumulated points during a single play session.
- **Playfield**: The bounded rectangular game area rendered in the browser, including a top boundary and a ground boundary.
- **Ground**: The bottom boundary of the Playfield that causes a collision when touched by the Ghost.
- **Flap**: The upward velocity impulse applied to the Ghost when the player provides input.
- **Game_State**: The current mode of the Game, which is one of Ready, Playing, or Game_Over.
- **Audio_System**: The component of the Game responsible for playing sound effects.

## Requirements

### Requirement 1: Game Initialization

**User Story:** As a player, I want the game to load in a ready state, so that I can start playing when I choose.

#### Acceptance Criteria

1. WHEN the Game finishes loading all required assets in the browser within 5 seconds, THE Game SHALL set the Game_State to Ready.
2. IF any required asset fails to load within 5 seconds, THEN THE Game SHALL remain in the Loading state and display an error message indicating that loading failed.
3. WHILE the Game_State is Ready, THE Game SHALL display the Ghost at a fixed starting position located horizontally at 30% of the Playfield width and vertically at 50% of the Playfield height.
4. WHILE the Game_State is Ready, THE Game SHALL set the Score to 0.
5. WHILE the Game_State is Ready, THE Game SHALL display a start prompt containing text instructing the player to perform the start input to begin.
6. WHILE the Game_State is Ready, THE Game SHALL keep the Ghost stationary at the starting position until the player performs the start input.

### Requirement 2: Starting the Game

**User Story:** As a player, I want to start the game with a single action, so that I can begin playing immediately.

#### Acceptance Criteria

1. WHEN the player provides a flap input WHILE the Game_State is Ready, THE Game SHALL set the Game_State to Playing within one browser animation frame of receiving that input.
2. WHEN the Game_State changes to Playing, THE Game SHALL begin scrolling existing Pipe_Pairs from the right edge toward the left edge of the Playfield starting on the next browser animation frame.
3. WHEN the Game_State changes to Playing, THE Game SHALL apply exactly one Flap impulse to the Ghost for the single flap input that triggered the transition.

### Requirement 3: Flap Input and Gravity

**User Story:** As a player, I want the ghost to rise when I tap and fall when I don't, so that I can control its vertical movement.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL apply a fixed downward gravity acceleration, expressed in pixels per second squared, to the Ghost on every physics update.
2. WHEN the player provides a flap input WHILE the Game_State is Playing, THE Game SHALL replace the Ghost vertical velocity with a fixed upward velocity expressed in pixels per second.
3. WHILE the Game_State is Playing, THE Game SHALL limit the Ghost downward velocity to a fixed maximum fall speed expressed in pixels per second.
4. WHEN the player provides a flap input WHILE the Game_State is Playing, THE Audio_System SHALL play the jump sound effect from `assets/jump.wav`.
5. IF the jump sound effect cannot be loaded or played, THEN THE Game SHALL continue gameplay without interruption.
6. WHILE the Game_State is neither Ready, Playing, nor Game_Over, THE Game SHALL ignore flap input and leave the Ghost vertical velocity unchanged.
7. THE Game SHALL accept a mouse click, a touch tap, and a Spacebar key press as valid flap inputs.

### Requirement 4: Pipe Generation and Scrolling

**User Story:** As a player, I want an endless stream of pipes to navigate, so that the game continues as long as I survive.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL move every Pipe_Pair horizontally toward the left edge of the Playfield at a uniform speed between 30% and 50% of the Playfield width per second.
2. WHILE the Game_State is Playing, THE Game SHALL generate a new Pipe_Pair at the right edge of the Playfield such that the horizontal distance between the left edge of the new Pipe_Pair and the left edge of the previous Pipe_Pair is between 40% and 60% of the Playfield width.
3. WHEN the rightmost edge of a Pipe_Pair has moved past the left edge of the Playfield by any amount greater than zero, THE Game SHALL remove that Pipe_Pair from the Playfield within one animation frame.
4. THE Game SHALL size the Gap of each generated Pipe_Pair between 20% and 35% of the Playfield height.
5. THE Game SHALL position the Gap of each generated Pipe_Pair at a random vertical offset such that the Gap remains entirely within the Playfield with at least a 10% of Playfield height margin from the top boundary and at least a 10% of Playfield height margin from the Ground.

### Requirement 5: Scoring from Pipes

**User Story:** As a player, I want to earn points for passing pipes, so that I can measure my progress.

#### Acceptance Criteria

1. WHEN the horizontal center of the Ghost crosses the horizontal center of a Pipe_Pair for the first time WHILE the Game_State is Playing, THE Game SHALL increase the Score by exactly 1 for that Pipe_Pair.
2. THE Game SHALL increase the Score by no more than 1 for any single Pipe_Pair during a play session.
3. IF the Ghost collides with a Pipe_Pair before its horizontal center crosses the horizontal center of that Pipe_Pair, THEN THE Game SHALL NOT increase the Score for that Pipe_Pair.
4. WHILE the Game_State is Playing, THE Game SHALL display the current Score as a non-negative integer within the Playfield.
5. WHEN the Score changes, THE Game SHALL update the displayed Score within 100 milliseconds to match the new Score value.

### Requirement 6: Collectible Points

**User Story:** As a player, I want to collect point items between the pipes, so that I can increase my score beyond passing pipes.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL move each Collectible horizontally toward the left edge of the Playfield at the same speed as Pipe_Pairs.
2. WHILE the Game_State is Playing, WHEN the Ghost bounding box first overlaps an uncollected Collectible bounding box, THE Game SHALL mark that Collectible as collected and increase the Score by exactly 1.
3. WHEN a Collectible is marked as collected, THE Game SHALL remove that Collectible from the Playfield within the same frame so that it can no longer be collected again.
4. WHEN a Collectible moves completely past the left edge of the Playfield without having been collected, THE Game SHALL remove that Collectible from the Playfield.
5. THE Game SHALL render each Collectible using the `img/chiikawa_point.png` sprite.

### Requirement 7: Collision and Game Over

**User Story:** As a player, I want the game to end when the ghost crashes, so that there is a clear fail condition.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, WHEN the Ghost bounding box overlaps a top or bottom pipe of any Pipe_Pair, THE Game SHALL set the Game_State to Game_Over.
2. WHILE the Game_State is Playing, WHEN the Ghost reaches the Ground, THE Game SHALL set the Game_State to Game_Over.
3. IF the Ghost reaches the top boundary of the Playfield WHILE the Game_State is Playing, THEN THE Game SHALL constrain the Ghost vertical position to the top boundary and set the Ghost vertical velocity to zero.
4. WHEN the Game_State changes to Game_Over, THE Audio_System SHALL play the game over sound effect from `assets/game_over.wav` exactly once.
5. WHEN the Game_State changes to Game_Over, THE Game SHALL stop scrolling all Pipe_Pairs and Collectibles and stop all Ghost motion.

### Requirement 8: Game Over Screen and Restart

**User Story:** As a player, I want to see my final score and restart the game, so that I can try again.

#### Acceptance Criteria

1. WHILE the Game_State is Game_Over, THE Game SHALL display the final Score as a non-negative integer.
2. WHILE the Game_State is Game_Over, THE Game SHALL display a restart prompt containing text instructing the player how to restart.
3. WHILE the Game_State is Game_Over, THE Game SHALL display the highest Score achieved across prior sessions in the current browser alongside the final Score.
4. IF the Game_State transitions to Game_Over AND the final Score exceeds the previously stored highest Score, THEN THE Game SHALL update the stored highest Score to equal the final Score.
5. WHEN the player provides a flap input WHILE the Game_State is Game_Over AND at least 500 milliseconds have elapsed since the Game_State became Game_Over, THE Game SHALL reset the Game to the Ready state.
6. IF the player provides a flap input WHILE the Game_State is Game_Over AND fewer than 500 milliseconds have elapsed since the Game_State became Game_Over, THEN THE Game SHALL ignore the flap input and remain in the Game_Over state.
7. WHEN the Game resets to the Ready state, THE Game SHALL remove all Pipe_Pairs and Collectibles from the Playfield within 100 milliseconds.
8. WHEN the Game resets to the Ready state, THE Game SHALL set the current Score to 0.

### Requirement 9: Retro Visual Presentation

**User Story:** As a player, I want a retro pixel-art look, so that the game feels like a classic arcade experience.

#### Acceptance Criteria

1. WHILE in the Playing, Ready, or Game_Over state, THE Game SHALL render the Ghost using the `assets/ghosty.png` sprite.
2. IF the `assets/ghosty.png` sprite fails to load, THEN THE Game SHALL render the Ghost as a solid-color placeholder shape of the same dimensions and display a visible indication that the sprite is missing.
3. WHILE in the Playing state, THE Game SHALL scroll the Playfield background horizontally at a constant speed.
4. WHILE in the Ready or Game_Over state, THE Game SHALL hold the Playfield background stationary.
5. THE Game SHALL render all sprites with image smoothing disabled so that pixel edges remain sharp.
6. THE Game SHALL render the Score using a pixel-style font at a minimum height of 16 pixels.

### Requirement 10: Game Loop Timing

**User Story:** As a player, I want smooth and consistent motion, so that the game feels responsive.

#### Acceptance Criteria

1. WHILE the Game_State is Playing, THE Game SHALL update physics and rendering once per browser animation frame, targeting a minimum of 30 frames per second on displays refreshing at 60 Hz or higher.
2. WHILE the Game_State is Playing, THE Game SHALL scale each movement update by the elapsed time between the current and previous frame so that an object's travelled distance over any fixed 1-second interval varies by no more than 5 percent across display refresh rates from 30 Hz to 144 Hz.
3. IF the elapsed time between two consecutive frames exceeds 100 milliseconds, THEN THE Game SHALL clamp the elapsed time used for the physics update to 100 milliseconds, so that a single stalled frame does not cause object positions to jump beyond one frame's expected movement.
4. WHEN the browser tab loses visibility or rendering is suspended, THE Game SHALL pause physics updates and resume from the last updated state without applying accumulated elapsed time when visibility is restored.
