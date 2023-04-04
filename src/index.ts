import { createPixelClickHandler } from "./createPixelClickHandler"
import { connect } from "./connection"
import { signedFetch } from '@decentraland/SignedFetch'
import { getUserData } from '@decentraland/Identity'

type MuralParams = {
    position: Vector3,
    rotation: Quaternion,
    mural: number,
    server_url_http: string
    server_url_ws: string
}

/**
 * 
 *  A Mural Creator function
 * 
 * @param mural_params - Dictionary with position, rotation, mural (id) and server_url
 * @returns Null
 * @public
 */
export function CreateMural (mural_params: MuralParams) {

    var connect_interval = 0
    var lastPaint = 0
    var receivedSyncId = 0
    var currentSyncId = -1
    var connected = false
    var selected_color = {r:0, g:0, b:0, a:0}

    var paint_queue: Array<any> = []

    var muralroom: any;


    //-----------------------------------------------------------------------------------------------------
    //main entity
    const main = new Entity()
    main.addComponent(new Transform({
        position: mural_params.position,
        rotation: mural_params.rotation,
    }))
    engine.addEntity(main)

    //-----------------------------------------------------------------------------------------------------
    //mural entity
    const mural = new Entity()
    const mural_plane = new PlaneShape()
    mural_plane.uvs = [
        0, 0,
        1, 0,
        1, 1,
        0, 1,
        
        0, 0,
        1, 0,
        1, 1,
        0, 1,
    ]
    
    const mural_texture = new Texture(mural_params.server_url_http + "/image/"+mural_params.mural, {samplingMode: 0})
    const mural_material = new Material()
    mural_material.albedoTexture = mural_texture

    mural.addComponent(mural_material)
    mural.addComponent(mural_plane)
    mural.addComponent(new Transform({
        scale: new Vector3(6, 4 ,1)
    }))
    mural.setParent(main)

    //-----------------------------------------------------------------------------------------------------
    //background entity
    const background = new Entity()
    const background_plane = new PlaneShape()
    
    const background_texture = new Texture(mural_params.server_url_http + "/background")
    const background_material = new Material()
    background_material.albedoTexture = background_texture

    background.addComponent(background_material)
    background.addComponent(background_plane)

    background.addComponent(new Transform({
        position: new Vector3(-4, 0, 0),
        rotation: Quaternion.Euler(0,0,180), 
        scale: new Vector3(2,4,1)
    }))
    background.setParent(main)

    //-----------------------------------------------------------------------------------------------------
    //Status text entity
    const status = new Entity()
    const status_shape = new TextShape()
    status.addComponent(status_shape)
    status.addComponent(new Transform({
        position: new Vector3(-4.85, -1.2, -0.01),
    }))
    status.setParent(main)
    status_shape.hTextAlign = "left"
    status_shape.fontSize = 2
    status_shape.value = "Connecting..."

    //-----------------------------------------------------------------------------------------------------
    const IMAGE_SIZE = [320/10,240/10]; 
    const [WIDTH, HEIGHT] = IMAGE_SIZE; //originSize
    const originS = [WIDTH, HEIGHT];
    const ENDPOINT = mural_params.server_url_http + "/validate";


    async function connect_room() {
        const user = await getUserData();

        if (!user?.hasConnectedWeb3){
            setMessage("Connect wallet\nto paint");
            return;
        }

        connect("my_room", mural_params.server_url_ws, {address: user?.publicKey, mural: mural_params.mural}).then(async (room) => {
            muralroom = room
            connected = true

            setMessage("Connected!")
            function onClickImageCallback(coord: any){
                log('callback function', coord)
                if (coord[1] >= 21) {
                    room.send("pick_color", coord)
                    return
                };
                lastPaint = 0
                paint_queue.push({
                    x: coord[0],
                    y: coord[1],
                    r: selected_color.r,
                    g: selected_color.g,
                    b: selected_color.b,
                    a: selected_color.a,
                })
                AddCursor(coord[0], coord[1], selected_color)
            };
            const {Dispose, AddCursor, HideCursor} = createPixelClickHandler(mural, originS, onClickImageCallback);

            /*room.state.listen("syncId", (num: number) => {
                if (num > receivedSyncId) {
                    receivedSyncId = num
                }
            });*/

            room.state.murals.onAdd = (newmural:any, key:any) => {
                log(newmural, "has been added at", key);
                log("Key:", key, " mural:", mural_params.mural);
                if (key != ""+mural_params.mural) { return }
                log("listen to onChange for", key)
                newmural.onChange = function(changes:any) {
                    log("Mural", key, " changed:", changes);
                    changes.forEach((change:any) => {
                        log(change.field);
                        log(change.value);
                        log(change.previousValue);
                        if (change.field == "syncId") {
                            receivedSyncId = change.value;
                        }
                    })
                };
            
                // force "onChange" to be called immediatelly
                newmural.triggerAll();
            };

            room.onMessage("cursor",(message) => {
                if (!message["visible"]){
                    HideCursor()
                }
            });

            room.onMessage("color",(message) => {
                selected_color = message
            });

            room.onMessage("msg",(message) => {
                setMessage(message["msg"])
            });

            room.onLeave(()=>{
                connected = false
                paint_queue = []
                setMessage("Disconnected")
                Dispose()
            });

            var is_user_valid = false;
            try {
                var response = await signedFetch(ENDPOINT, {
                    method:'POST', 
                    body:JSON.stringify({    
                        sessionId: room.sessionId,
                        address: user?.publicKey
                    }),
                    headers:{
                        "Content-Type":"application/json"
                    }
                });
        
                if (!response.text) {
                    throw new Error("Invalid response")
                }
            
                var json = await JSON.parse(response.text)
                log("json", json);
                if (json.valid) {
                    is_user_valid = true;
                }
            } catch {
                log("Error fetching URL");
            }

            if (!is_user_valid) {
                connect_interval = 60;
                await room.leave();
                setMessage("Validation failed\nretrying...");
            }
            

        }).catch((err) => {
            error(err);
        }); 
    };


    function setMessage(msg: string) {
        status_shape.value = msg
    }


    class MuralSyncSystem implements ISystem {
        lastSyncTime = 0;

        update(delta:number) {
            this.lastSyncTime += delta;
            if (this.lastSyncTime < 1+Math.random()) {
                return;
            }

            if (currentSyncId != receivedSyncId) {
                currentSyncId = receivedSyncId;
                this.lastSyncTime = 0;
                const new_texture = new Texture(
                    mural_params.server_url_http + "/image/"+mural_params.mural+"?"+currentSyncId, {samplingMode: 0}
                ) 
                mural_material.albedoTexture = new_texture;
            }
        }
    }
    engine.addSystem(new MuralSyncSystem());


    class ReconnectSystem implements ISystem {
        lastConnection = 0;
        
        update(delta:number) {
            this.lastConnection += delta;
            if (this.lastConnection < connect_interval) { return }
            this.lastConnection = 0;
            if (!connected) {
                connect_interval = 10;
                connect_room();
            }
        }
    }
    engine.addSystem(new ReconnectSystem());


    class PaintSystem implements ISystem {
        
        update(delta:number) {
            lastPaint += delta;
            if (lastPaint < 2) { return }
            lastPaint = 0
            if (paint_queue.length < 1) {return}
            muralroom.send("paint", paint_queue)
            log("Send queue: ")
            log(paint_queue)
            paint_queue = []
        }
    }
    engine.addSystem(new PaintSystem());

}