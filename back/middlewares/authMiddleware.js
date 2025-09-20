import jwt from 'jsonwebtoken';

const SECRET_JWT = process.env.SECRET_JWT || 'chave_secreta';

export const verificarToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.json({ msg: 'Você não passou o token' });
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ msg: "Token não fornecido!" });
    }

    jwt.verify(token, SECRET_JWT, (err, decoded) => {
        if (err) {
            console.log(err);
            return res.status(403).json({ msg: "Token inválido ou expirado!" });
        }
        
        req.userEmail = decoded.email;
        next();
    });
};
