export interface CardTemplate {
  id: string;
  name: string;
  content: string;
}

export const DEFAULT_TEMPLATES: CardTemplate[] = [
  {
    id: "sepha-template",
    name: "Sepha Template",
    content: `>Setting and Location:

>APPEARANCE
- Full Name: 
- Skintone: 
- Sex/Gender: 
- Height: 
- Age: 
- Occupation: 
- Hair: 
- Eyes:  
- Body: 
- Face:
- Privates:
- Clothes:
---

>CHARACTER OVERVIEW


>BACKGROUND
- 
- 
- 
- 
- 

>PSYCH DEEPER DIVE
- 
- 


>MENTAL AND EMOTIONAL STATE
- 
- 
- 

>MOTIVATORS
 - 
 -  
 - 

>GOAL
- Short term:
- Long term: 
---
>PERSONALITY
- 
- 
- 
- 
- 
-
- 



---
>CONNECTION WITH {{user}}**
- 
- 
-.
- 


>BEHAVIOR WITH {{user}}
- 
- 
- 
- 
 - 
- 

---
>SEXUALITY AND SEXUAL HABITS
- Sexuality: 
- During Sex: 
- Kinks: 
-  sexual habit here
- 
- 
---
>HABITS AND QUIRKS
- 
- 
-
- 



---
>CONNECTIONS
- 
- 


>SPEECH DETAILS AND EXAMPLES
- Style:
- Quirks:
- “quote quote”
- `
  },
  {
    id: "memi-template",
    name: "Memi Template",
    content: `<{{char}}>

> OVERVIEW
- 

> IDENTITY
- Name: 
- Age: 
- Species/Origin:
- Occupation:  
- Gender: 
- Sexual Orientation: 

> APPEARANCE
- Hair: 
- Eyes: 
- Height: 
- Body: 
- Clothing: 
- Features: 
- Privates:

> BACKSTORY
- 
-
- 
- 

> CONNECTIONS
- {{user}}: 
- 
- 

> PERSONALITY
- Archetype: 
- Tags: 
- Core Traits:
   - Adjective: Description for the llm to portray said trait
   - 
   - 
   - 
   - 

> PSYCHOLOGICAL CORE
- Core Belief: Quote. What belief does this character go by? 
- Primary Trigger: What situation/behavior causes this belief to get activated?
- Maladaptive Response: What does the character do immediately in response to a trigger to cope with it but screws them over long term?

> EMOTIONAL STATES
- Default Mask: How does the character usually act when nothing's wrong?
- Pressure Response: How does the character react when scared/stressed/challenged/cornered? 
- Unobserved State: Who is the character when no one is around?
- Escalation Threshold: What specific circumstances or situation pushes them from controlled to dangerous/reckless/openly emotional?
- Core fear: What is the character terrified of and wants to avoid at all costs? (Should connect back to core belief in a way)

> HABITS & BEHAVIOR
- Likes:
- Dislikes: 
- Habits/Quirks:
   - 
   - 
   - 

> BEHAVIOR WITH {{USER}}
# Default Interaction Pattern:
- 

# When Triggered (Conflict Behavior):
- 

# When Jealous / Threatened:
- 

# When Unobserved or Safe With {{user}}:
-

# Inner thoughts and self-justification:
- 

> SEXUAL PREFERENCES
- Role: Dominant/Switch/Submissive (situational / default / flexible)
- Style: rough, verbal, controlling etc.
- Likes: X, Y, Z
- Dislikes: X
- Boundaries: X
- Aftercare: brief description

> SPEECH
- Tone: 
- Style/Quirks: 

> CAPABILITIES
- Skills:
- Assets: 
- Residence: 

> SETTING
- World Setting: short description 

> AI GUIDANCE
-

</{{char}}>`
  },
  {
    id: "bigsister-template",
    name: "BigSister Template",
    content: `<character>
> *[Character Info:*
* Full Name:
* Aliases: 
* Species:
* Nationality:
* Age: 
* Occupation: 
* Appearance: 
* Distinctive Markings: 
* Fashion:
* Scent:]
---
> *[Backstory:*
* Origin: 
* **Key Event/Ritual:** 
* **Current Motivation:**]
---
> *[Current Setting:*
* **Year/Era:** 
* **The World:** 
* **Politics (if applicable):** 
* **The Vibe:**]
---
> *[Powers & Abilities:*
* Ability Name: 
* **Ability Name: 
* Ability Name:]
---
> *[Relationships & NPCs:*
* {{user}}: [Describe the initial meeting, the vibe, and the hidden conflict/attraction].
---
* Character Name (Role/Relation): 
* Character Name (Role/Relation)]
---
> *[Personality & Psychology:*
* Archetype:
* Core Vibe:

**Traits:**
* Trait 1
* Trait 2
* Trait 3
* Trait 4
* Trait 5


**Trauma & Triggers:**
* Trigger Name: 
* Trigger Name: 
* Trigger Name:

**Behavioral Cues:**
* Cue 1 - e.g., Facial expression when angry
* Cue 2 - e.g., Nervous habi
* Cue 3 - e.g., Social mask vs. Reality]
---
> *[Sexual Profile & Kinks:*
* Orientation:
* Experience: 
* Anatomy:]

**The Dynamic:**
* Describe the dominant/submissive nature, the pacing, and the emotional intensity].

**Specific Kinks & Preferences:**
* Kink 1: 
* Kink 2: 
* Kink 3: 
* Kink 4:
* The Complication/Twist: Is there a curse, a biological constraint, or a specific rule that complicates intimacy?]
</character>`
  }
];
